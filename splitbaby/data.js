/* ============================================================
   Splitbaby — data layer

   One ledger, two sites. Everything here is flat-agnostic: the
   expenses collection is shared, and each site merely presents
   its own lens on it (a B002 expense can include Aryan, so
   balances must be computed over the whole thing).

   Two interchangeable backends behind one API:
     - firestore  : live, offline-capable, multi-device
     - demo       : localStorage only, used when no Firebase
                    config has been pasted yet, so the entire
                    UI is clickable before the project exists

   Plus a local mirror of the last known ledger, which gives an
   instant first paint and doubles as the recovery net for the
   open-access decision.
   ============================================================ */

import { FIREBASE_CONFIG } from "./firebase-config.js";
import { PEOPLE, SEED_PRESETS, registerPerson, slugify, personName } from "./config.js";
import { live, sumSplits, formatMoney, isSpend } from "./ledger.js";

const SDK        = "https://www.gstatic.com/firebasejs/12.6.0/";
const MIRROR_KEY = "splitbaby.mirror.v1";
const DEMO_KEY   = "splitbaby.demo.v1";
const HISTORY_CAP = 20;

/* ------------------------------------------------------------
   Observable state
   ------------------------------------------------------------ */

export const state = {
  ready: false,
  mode: "demo",            /* "demo" | "live" */
  sync: "connecting",      /* connecting | live | cached | offline | demo | error */
  expenses: [],            /* newest first */
  presets: [],
  error: null,
  fromMirror: false
};

const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return function () { listeners.delete(fn); };
}

function emit() {
  listeners.forEach(function (fn) {
    try { fn(state); } catch (e) { console.error("[splitbaby] listener failed", e); }
  });
}

function setSync(s) {
  if (state.sync !== s) { state.sync = s; emit(); }
}

/* ------------------------------------------------------------
   localStorage helpers — every access is guarded, because
   Safari private mode throws rather than returning null
   ------------------------------------------------------------ */

function lsGet(key) {
  try {
    var raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function lsSet(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

/* ------------------------------------------------------------
   Normalisation — anything read from either backend passes
   through here, so the rest of the app can trust the shape
   even if an old or hand-edited document is missing fields.
   ------------------------------------------------------------ */

function normalizeExpense(id, d) {
  var raw = d || {};
  var splits = {};
  Object.keys(raw.splits || {}).forEach(function (k) {
    var v = Math.round(Number(raw.splits[k]) || 0);
    if (v !== 0) splits[k] = v;
  });
  var participants = Array.isArray(raw.participants) && raw.participants.length
    ? raw.participants.slice()
    : Object.keys(splits);

  return {
    id: id,
    kind: raw.kind === "settlement" ? "settlement" : "expense",
    coverFor: raw.coverFor || null,
    title: String(raw.title || "").slice(0, 80),
    note: String(raw.note || "").slice(0, 300),
    category: raw.category || null,
    amountPaise: Math.round(Number(raw.amountPaise) || 0),
    paidBy: raw.paidBy || "",
    splits: splits,
    splitMode: raw.splitMode || "equal",
    shares: raw.shares || null,
    participants: participants,
    flat: raw.flat === "b603" ? "b603" : "b002",
    date: String(raw.date || "").slice(0, 10),
    at: Number(raw.at) || 0,
    /* kept raw: a Firestore Timestamp survives to flattenOrder,
       which is the only place that knows how to unwrap it */
    order: raw.serverAt != null ? raw.serverAt : (Number(raw.at) || 0),
    updatedAt: Number(raw.updatedAt) || 0,
    createdBy: raw.createdBy || "",
    deleted: raw.deleted === true,
    history: Array.isArray(raw.history) ? raw.history : []
  };
}

/* Server time wins for ordering so one phone with a wrong clock
   cannot reshuffle everyone else's feed; the local `at` is only
   a fallback until the write round-trips. */
function sortExpenses(rows) {
  return rows.sort(function (a, b) {
    return (b.order - a.order) || (b.at - a.at) || String(b.id).localeCompare(String(a.id));
  });
}

/* ------------------------------------------------------------
   Demo backend
   ------------------------------------------------------------ */

const demoBackend = {
  mode: "demo",
  store: null,

  init: function () {
    this.store = lsGet(DEMO_KEY) || { expenses: {}, people: {}, presets: {} };
    return Promise.resolve();
  },

  watch: function (cb) {
    this.cb = cb;
    this.push();
    /* another tab in demo mode still propagates */
    window.addEventListener("storage", function (e) {
      if (e.key === DEMO_KEY) { this.store = lsGet(DEMO_KEY) || this.store; this.push(); }
    }.bind(this));
  },

  push: function () {
    if (!this.cb) return;
    this.cb({
      expenses: Object.keys(this.store.expenses).map(function (id) {
        return normalizeExpense(id, this.store.expenses[id]);
      }, this),
      people: Object.keys(this.store.people).map(function (id) {
        return Object.assign({ id: id }, this.store.people[id]);
      }, this),
      presets: Object.keys(this.store.presets).map(function (id) {
        return Object.assign({ id: id }, this.store.presets[id]);
      }, this),
      cached: false
    });
  },

  save: function () { lsSet(DEMO_KEY, this.store); this.push(); },

  create: function (coll, id, data) {
    var key = id || ("d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    this.store[coll][key] = Object.assign({}, data, { serverAt: Date.now() });
    this.save();
    return Promise.resolve(key);
  },

  update: function (coll, id, patch) {
    var cur = this.store[coll][id];
    if (!cur) return Promise.reject(new Error("Not found"));
    this.store[coll][id] = Object.assign({}, cur, patch);
    this.save();
    return Promise.resolve();
  },

  /* read-modify-write with the same staleness check as live mode */
  mutate: function (coll, id, fn) {
    var cur = this.store[coll][id];
    if (!cur) return Promise.reject(new Error("Not found"));
    var next = fn(Object.assign({}, cur));
    if (!next) return Promise.resolve();
    this.store[coll][id] = next;
    this.save();
    return Promise.resolve();
  },

  batch: function (ops) {
    ops.forEach(function (op) {
      if (op.type === "create") {
        var key = op.id || ("d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
        this.store[op.coll][key] = Object.assign({}, op.data, { serverAt: Date.now() });
        op.assignedId = key;
      } else if (op.type === "update") {
        this.store[op.coll][op.id] = Object.assign({}, this.store[op.coll][op.id] || {}, op.data);
      }
    }, this);
    this.save();
    return Promise.resolve(ops.map(function (o) { return o.assignedId || o.id; }));
  }
};

/* ------------------------------------------------------------
   Firestore backend
   ------------------------------------------------------------ */

const firestoreBackend = {
  mode: "live",
  F: null,
  db: null,

  init: function () {
    var self = this;
    return Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-firestore.js")
    ]).then(function (mods) {
      var appMod = mods[0];
      var F = mods[1];
      self.F = F;
      var app = appMod.initializeApp(FIREBASE_CONFIG);
      /* persistent cache: reads work offline and writes queue up
         until the connection comes back */
      try {
        self.db = F.initializeFirestore(app, {
          localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
        });
      } catch (e) {
        /* a second initialise in the same tab, or a browser with
           no IndexedDB: fall back to the in-memory default */
        console.warn("[splitbaby] persistent cache unavailable", e);
        self.db = F.getFirestore(app);
      }
    });
  },

  watch: function (cb) {
    var self = this, F = this.F;
    var latest = { expenses: [], people: [], presets: [], cached: false };
    var seen = { expenses: false, people: false, presets: false };

    function fan(which, rows, cached) {
      latest[which] = rows;
      latest.cached = cached;
      seen[which] = true;
      if (seen.expenses && seen.people) cb(latest);
    }

    function sub(name, map) {
      return F.onSnapshot(
        F.collection(self.db, name),
        { includeMetadataChanges: true },
        function (snap) {
          var rows = [];
          snap.forEach(function (d) { rows.push(map(d.id, d.data())); });
          fan(name, rows, snap.metadata.fromCache);
        },
        function (err) {
          console.error("[splitbaby] " + name + " listener failed", err);
          state.error = err && err.message ? err.message : String(err);
          setSync("error");
        }
      );
    }

    sub("expenses", normalizeExpense);
    sub("people", function (id, d) { return Object.assign({ id: id }, d); });
    sub("presets", function (id, d) { return Object.assign({ id: id }, d); });
  },

  create: function (coll, id, data) {
    var F = this.F, db = this.db;
    var payload = Object.assign({}, data, { serverAt: F.serverTimestamp() });
    if (id) {
      return F.setDoc(F.doc(db, coll, id), payload).then(function () { return id; });
    }
    return F.addDoc(F.collection(db, coll), payload).then(function (ref) { return ref.id; });
  },

  update: function (coll, id, patch) {
    var F = this.F;
    return F.updateDoc(F.doc(this.db, coll, id), patch);
  },

  /* transactional read-modify-write: two phones editing the same
     expense cannot silently clobber each other */
  mutate: function (coll, id, fn) {
    var F = this.F, db = this.db;
    return F.runTransaction(db, function (tx) {
      var ref = F.doc(db, coll, id);
      return tx.get(ref).then(function (snap) {
        if (!snap.exists()) throw new Error("Not found");
        var next = fn(snap.data());
        if (!next) return;
        tx.set(ref, next);
      });
    });
  },

  batch: function (ops) {
    var F = this.F, db = this.db;
    var batch = F.writeBatch(db);
    var ids = [];
    ops.forEach(function (op) {
      if (op.type === "create") {
        var ref = op.id ? F.doc(db, op.coll, op.id) : F.doc(F.collection(db, op.coll));
        batch.set(ref, Object.assign({}, op.data, { serverAt: F.serverTimestamp() }));
        ids.push(ref.id);
      } else if (op.type === "update") {
        batch.update(F.doc(db, op.coll, op.id), op.data);
        ids.push(op.id);
      }
    });
    return batch.commit().then(function () { return ids; });
  }
};

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */

let backend = demoBackend;
let homeFlat = "b002";

function isConfigured() {
  /* ?demo=1 forces the localStorage backend even on a configured
     build. The test suite runs on it, and it doubles as a safe
     sandbox for trying the app without touching the real ledger. */
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "1") return false;
  } catch (e) { /* ancient browser: fall through to the real check */ }

  var c = FIREBASE_CONFIG;
  return !!(c && c.projectId && c.apiKey &&
    String(c.projectId).indexOf("PASTE") < 0 &&
    String(c.apiKey).indexOf("PASTE") < 0);
}

/* `serverAt` arrives as a Firestore Timestamp; flatten it so the
   sort key is a plain number everywhere. */
function flattenOrder(rows) {
  return rows.map(function (r) {
    var o = r.order;
    if (o && typeof o === "object" && typeof o.toMillis === "function") o = o.toMillis();
    r.order = Number(o) || r.at || 0;
    return r;
  });
}

export function start(flat) {
  homeFlat = flat || "b002";
  state.mode = isConfigured() ? "live" : "demo";
  backend = state.mode === "live" ? firestoreBackend : demoBackend;

  /* instant first paint from the mirror, before any network */
  var mirror = lsGet(MIRROR_KEY);
  if (mirror && Array.isArray(mirror.expenses) && mirror.expenses.length) {
    state.expenses = sortExpenses(flattenOrder(mirror.expenses.map(function (e) {
      return normalizeExpense(e.id, e);
    })));
    state.fromMirror = true;
    (mirror.people || []).forEach(registerPerson);
    emit();
  }

  setSync(state.mode === "demo" ? "demo" : "connecting");

  return backend.init().then(function () {
    backend.watch(function (snap) {
      /* fold dynamic guests into the shared roster so every
         name/colour lookup resolves them like a config person */
      (snap.people || []).forEach(registerPerson);

      state.expenses = sortExpenses(flattenOrder(snap.expenses || []));
      state.presets = (snap.presets || []).slice().sort(function (a, b) {
        return String(a.label || "").localeCompare(String(b.label || ""));
      });
      state.ready = true;
      state.fromMirror = false;
      state.error = null;

      if (state.mode === "demo") setSync("demo");
      else if (!navigator.onLine) setSync("offline");
      else setSync(snap.cached ? "cached" : "live");

      /* the recovery net */
      lsSet(MIRROR_KEY, {
        savedAt: Date.now(),
        expenses: state.expenses,
        people: PEOPLE.map(function (p) {
          return { id: p.id, name: p.name, flat: p.flat, kind: p.kind, upi: p.upi, active: p.active !== false };
        })
      });

      seedIfEmpty(snap);
      emit();
    });
  }).catch(function (err) {
    console.error("[splitbaby] start failed", err);
    state.error = (err && err.message) ? err.message : String(err);
    state.ready = true;
    setSync("error");
    emit();
  });
}

window.addEventListener("online", function () {
  if (state.mode === "live") setSync("live");
});
window.addEventListener("offline", function () {
  if (state.mode === "live") setSync("offline");
});

/* ------------------------------------------------------------
   Seeding — idempotent, because the document id is derived from
   the person, so two phones booting at once cannot duplicate.
   Only missing documents are written, so a name or UPI edited
   straight in the console is never clobbered on next load.
   ------------------------------------------------------------ */

let seeded = false;

function seedIfEmpty(snap) {
  if (seeded) return;
  seeded = true;

  var have = {};
  (snap.people || []).forEach(function (p) { have[p.id] = true; });
  var missing = PEOPLE.filter(function (p) { return !have[p.id]; });

  var ops = missing.map(function (p) {
    return {
      type: "create", coll: "people", id: p.id,
      data: {
        name: p.name, flat: p.flat, kind: p.kind,
        upi: p.upi || "", active: true, at: Date.now()
      }
    };
  });

  if (!(snap.presets || []).length) {
    SEED_PRESETS.forEach(function (p) {
      ops.push({
        type: "create", coll: "presets", id: slugify(p.label),
        data: { label: p.label, amountPaise: p.amountPaise, category: p.category, at: Date.now() }
      });
    });
  }

  if (!ops.length) return;
  backend.batch(ops).catch(function (e) {
    console.warn("[splitbaby] seeding skipped", e);
  });
}

/* ------------------------------------------------------------
   Undo — one step, offered for five seconds after any write.
   Every action registers how to reverse itself, so undo never
   has to guess.
   ------------------------------------------------------------ */

let undoEntry = null;

export function pendingUndo() { return undoEntry; }

function arm(label, fn) {
  undoEntry = { label: label, run: fn, at: Date.now() };
  return undoEntry;
}

export function undo() {
  if (!undoEntry) return Promise.resolve(false);
  var e = undoEntry;
  undoEntry = null;
  return Promise.resolve(e.run()).then(function () { return true; });
}

export function clearUndo() { undoEntry = null; }

function historyEntry(by, action, summary) {
  return { at: Date.now(), by: by || "", action: action, summary: summary || "" };
}

function appendHistory(doc, entry) {
  var h = Array.isArray(doc.history) ? doc.history.slice() : [];
  h.push(entry);
  if (h.length > HISTORY_CAP) h = h.slice(h.length - HISTORY_CAP);
  return h;
}

/* ------------------------------------------------------------
   Writes
   ------------------------------------------------------------ */

export function addExpense(input) {
  var now = Date.now();
  var doc = {
    kind: "expense",
    coverFor: null,
    title: String(input.title || "").trim().slice(0, 80),
    note: String(input.note || "").trim().slice(0, 300),
    category: input.category || "other",
    amountPaise: Math.round(input.amountPaise),
    paidBy: input.paidBy,
    splits: input.splits,
    splitMode: input.splitMode || "equal",
    shares: input.shares || null,
    participants: Object.keys(input.splits),
    flat: input.flat || homeFlat,
    date: input.date || isoDate(new Date()),
    at: input.at || now,
    createdBy: input.by || input.paidBy,
    deleted: false,
    history: [historyEntry(input.by || input.paidBy, "created",
      formatMoney(input.amountPaise) + " " + (input.title || ""))]
  };

  return backend.create("expenses", null, doc).then(function (id) {
    arm("Expense added", function () { return softDelete(id, input.by, "undo"); });
    return id;
  });
}

/* All four settlement flows funnel through here, because a
   settlement IS an expense whose splits map is { payee: amount }.
   One formula then values every kind of movement. */
export function addSettlement(input) {
  var now = Date.now();
  var splits = {};
  splits[input.to] = Math.round(input.amountPaise);

  var isCover = !!input.coverFor;
  var label = isCover
    ? personName(input.by) + " covered " + personName(input.from)
    : personName(input.from) + " paid " + personName(input.to);

  var doc = {
    kind: "settlement",
    coverFor: isCover ? input.coverFor : null,
    title: label,
    note: String(input.note || "").trim().slice(0, 300),
    category: null,
    amountPaise: Math.round(input.amountPaise),
    paidBy: input.from,
    splits: splits,
    splitMode: "exact",
    shares: null,
    participants: [input.from, input.to],
    flat: input.flat || homeFlat,
    date: input.date || isoDate(new Date()),
    at: now,
    createdBy: input.by || input.from,
    deleted: false,
    history: [historyEntry(input.by || input.from, isCover ? "covered" : "settled",
      formatMoney(input.amountPaise))]
  };

  return backend.create("expenses", null, doc).then(function (id) {
    arm(isCover ? "Debt covered" : "Settled", function () { return softDelete(id, input.by, "undo"); });
    return id;
  });
}

/* Settle every simplified transfer one person owes, in a single
   batch so it is one undo and one sync, not five. */
export function settleAll(transfers, by) {
  var now = Date.now();
  var ops = transfers.map(function (t) {
    var splits = {};
    splits[t.to] = Math.round(t.amountPaise);
    return {
      type: "create", coll: "expenses", id: null,
      data: {
        kind: "settlement", coverFor: null,
        title: personName(t.from) + " paid " + personName(t.to),
        note: "", category: null,
        amountPaise: Math.round(t.amountPaise),
        paidBy: t.from, splits: splits, splitMode: "exact", shares: null,
        participants: [t.from, t.to],
        flat: homeFlat, date: isoDate(new Date()), at: now,
        createdBy: by || t.from, deleted: false,
        history: [historyEntry(by, "settled", formatMoney(t.amountPaise))]
      }
    };
  });

  if (!ops.length) return Promise.resolve([]);

  return backend.batch(ops).then(function (ids) {
    arm("Settled " + ids.length + " debts", function () {
      return backend.batch(ids.map(function (id) {
        return { type: "update", coll: "expenses", id: id, data: { deleted: true } };
      }));
    });
    return ids;
  });
}

/* `expected` is the order/updatedAt we rendered from. If it has
   moved, another device edited this expense and we refuse rather
   than overwrite silently. */
export function updateExpense(id, patch, by, expected) {
  return backend.mutate("expenses", id, function (cur) {
    if (expected != null && Number(cur.updatedAt || 0) !== Number(expected)) {
      var err = new Error("STALE");
      err.code = "stale";
      err.current = cur;
      throw err;
    }
    var before = Object.assign({}, cur);
    var next = Object.assign({}, cur, patch, {
      updatedAt: Date.now(),
      history: appendHistory(cur, historyEntry(by, "edited", describeDiff(cur, patch)))
    });
    arm("Expense edited", function () {
      return backend.mutate("expenses", id, function (c) {
        return Object.assign({}, c, {
          title: before.title, note: before.note, category: before.category,
          amountPaise: before.amountPaise, paidBy: before.paidBy,
          splits: before.splits, splitMode: before.splitMode, shares: before.shares,
          participants: before.participants, date: before.date,
          updatedAt: Date.now(),
          history: appendHistory(c, historyEntry(by, "reverted", "undo of an edit"))
        });
      });
    });
    return next;
  });
}

function describeDiff(before, patch) {
  var bits = [];
  if (patch.amountPaise != null && patch.amountPaise !== before.amountPaise) {
    bits.push(formatMoney(before.amountPaise) + " to " + formatMoney(patch.amountPaise));
  }
  if (patch.title != null && patch.title !== before.title) bits.push("title");
  if (patch.splits) bits.push("split");
  if (patch.date != null && patch.date !== before.date) bits.push("date");
  return bits.join(", ") || "details";
}

/* Deletion is always a flag. Nothing is ever destroyed, so the
   ledger stays auditable and an open URL cannot wipe history. */
export function softDelete(id, by, why) {
  return backend.mutate("expenses", id, function (cur) {
    return Object.assign({}, cur, {
      deleted: true,
      updatedAt: Date.now(),
      history: appendHistory(cur, historyEntry(by, why === "undo" ? "undone" : "deleted", ""))
    });
  }).then(function () {
    if (why !== "undo") {
      arm("Expense deleted", function () { return restoreExpense(id, by); });
    }
  });
}

export function restoreExpense(id, by) {
  return backend.mutate("expenses", id, function (cur) {
    return Object.assign({}, cur, {
      deleted: false,
      updatedAt: Date.now(),
      history: appendHistory(cur, historyEntry(by, "restored", ""))
    });
  });
}

/* ------------------------------------------------------------
   People and presets
   ------------------------------------------------------------ */

export function addGuest(name, flat, upi) {
  var clean = String(name || "").trim();
  if (!clean) return Promise.reject(new Error("A name is required"));

  var id = slugify(clean);
  if (!id) return Promise.reject(new Error("That name has no usable letters"));

  var existing = PEOPLE.filter(function (p) { return p.id === id; })[0];
  if (existing) {
    var e = new Error("DUPLICATE");
    e.code = "duplicate";
    e.person = existing;
    return Promise.reject(e);
  }

  var doc = {
    name: clean, flat: flat || homeFlat, kind: "visitor",
    upi: String(upi || "").trim(), active: true, at: Date.now()
  };
  registerPerson(Object.assign({ id: id }, doc));
  return backend.create("people", id, doc).then(function () { return id; });
}

export function setPersonActive(id, active) {
  registerPerson({ id: id, active: active });
  return backend.update("people", id, { active: !!active });
}

export function addPreset(label, amountPaise, category) {
  var clean = String(label || "").trim().slice(0, 40);
  if (!clean) return Promise.reject(new Error("A label is required"));
  return backend.create("presets", slugify(clean) || null, {
    label: clean, amountPaise: Math.round(amountPaise), category: category || "other", at: Date.now()
  });
}

export function removePreset(id) {
  /* presets are the one disposable collection, but rules forbid
     hard deletes everywhere, so this hides rather than destroys */
  return backend.update("presets", id, { hidden: true });
}

/* ------------------------------------------------------------
   Helpers the UI leans on
   ------------------------------------------------------------ */

export function isoDate(d) {
  var dt = d instanceof Date ? d : new Date(d);
  var m = String(dt.getMonth() + 1);
  var day = String(dt.getDate());
  return dt.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
}

/* Several phones and no sign-in makes a double submission a real
   risk, so warn when the same spend was just logged. */
export function findDuplicate(title, amountPaise, withinMs) {
  var window_ = withinMs || 3600000;
  var now = Date.now();
  var t = String(title || "").trim().toLowerCase();
  return live(state.expenses).filter(function (e) {
    return isSpend(e) &&
      Math.round(e.amountPaise) === Math.round(amountPaise) &&
      String(e.title || "").trim().toLowerCase() === t &&
      (now - (e.at || 0)) < window_;
  })[0] || null;
}

export function expenseById(id) {
  return state.expenses.filter(function (e) { return e.id === id; })[0] || null;
}

export function mirrorInfo() {
  var m = lsGet(MIRROR_KEY);
  if (!m || !Array.isArray(m.expenses)) return null;
  return { savedAt: m.savedAt || 0, count: m.expenses.length };
}

/* The recovery net for the open-access decision: push every
   expense this device still remembers back into the cloud. */
export function restoreFromMirror() {
  var m = lsGet(MIRROR_KEY);
  if (!m || !Array.isArray(m.expenses) || !m.expenses.length) {
    return Promise.reject(new Error("This device has nothing stored"));
  }
  var have = {};
  state.expenses.forEach(function (e) { have[e.id] = true; });
  var missing = m.expenses.filter(function (e) { return !have[e.id]; });
  if (!missing.length) return Promise.resolve(0);

  return backend.batch(missing.map(function (e) {
    var data = Object.assign({}, e);
    delete data.id;
    delete data.order;
    return { type: "create", coll: "expenses", id: e.id, data: data };
  })).then(function () { return missing.length; });
}

export function exportCsv(rows) {
  var head = ["id", "date", "kind", "title", "category", "amount", "paidBy", "splitMode", "participants", "shares", "createdBy", "deleted"];
  function cell(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var lines = [head.join(",")];
  (rows || state.expenses).forEach(function (e) {
    lines.push([
      e.id, e.date, e.kind, e.title, e.category || "",
      (e.amountPaise / 100).toFixed(2), personName(e.paidBy), e.splitMode,
      e.participants.map(personName).join(" | "),
      e.participants.map(function (p) { return ((e.splits[p] || 0) / 100).toFixed(2); }).join(" | "),
      personName(e.createdBy), e.deleted ? "yes" : "no"
    ].map(cell).join(","));
  });
  return lines.join("\n");
}

export function totalsCheck() {
  /* a cheap self-audit surfaced in settings: if this is ever
     non-zero the ledger has been corrupted by a bad write */
  var sum = 0;
  live(state.expenses).forEach(function (e) {
    sum += Math.round(e.amountPaise) - sumSplits(e.splits);
  });
  return sum;
}
