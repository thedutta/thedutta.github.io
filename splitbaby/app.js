/* ============================================================
   Splitbaby — UI

   One dense dashboard per flat, hash-routed (GitHub Pages has
   no SPA rewrite, so path routes would 404). The flat is set by
   the shell page via window.SPLITBABY_FLAT, which is the only
   difference between the two sites.
   ============================================================ */

import {
  CURRENCY, FLATS, CATEGORIES, DEFAULT_CATEGORY, SETTLE_ICON, COVER_ICON,
  PEOPLE, person, personName, personColor, initial, membersOf, guestsOf,
  peopleOf, otherFlat, category, isActive, photoUrl
} from "./config.js";

import {
  parseAmount, formatMoney, paiseToInput, buildSplits, equalSplit, sumSplits,
  exactSplitRemainder, netBalances, simplify, directBalances, personSummary,
  monthStats, monthsPresent, lastActivity, collapseGroups, membersOfNode,
  live, isSpend, MAX_PAISE
} from "./ledger.js";

import * as data from "./data.js";
import { renderGraph, mapEdges, guestBudget } from "./graph.js";

const FLAT  = window.SPLITBABY_FLAT === "b603" ? "b603" : "b002";
const AWAY  = otherFlat(FLAT);
const PREF_KEY = "splitbaby.pref." + FLAT;

/* ------------------------------------------------------------
   Preferences — who you are, and how you like the dashboard
   ------------------------------------------------------------ */

const prefs = Object.assign({
  me: null,
  graphMode: "owes",
  debtScope: "all",
  month: thisMonth(),      /* a saved null means the user chose All time */
  catMemory: {}
}, readPrefs());

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}; }
  catch (e) { return {}; }
}
function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {}
}

function me() {
  if (prefs.me && person(prefs.me)) return prefs.me;
  var first = membersOf(FLAT)[0];
  return first ? first.id : null;
}

function setMe(id) {
  prefs.me = id;
  savePrefs();
  render();
}

/* ------------------------------------------------------------
   DOM helpers
   ------------------------------------------------------------ */

function h(tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.slice(0, 2) === "on" && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  });
  (Array.isArray(kids) ? kids : (kids == null ? [] : [kids])).forEach(function (c) {
    if (c == null || c === false) return;
    n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  });
  return n;
}

function avatar(id, size) {
  var url = photoUrl(id);
  if (url) {
    return h("span", {
      class: "sb-av photo" + (size ? " " + size : ""),
      style: "--av:" + personColor(id) + ";background-image:url('" + url + "')",
      "aria-hidden": "true", text: initial(id)
    });
  }
  return h("span", {
    class: "sb-av" + (size ? " " + size : ""),
    style: "--av:" + personColor(id),
    "aria-hidden": "true", text: initial(id)
  });
}

function cluster(ids, max) {
  var cap = max || 5;
  var shown = ids.slice(0, cap);
  var kids = shown.map(function (id) { return avatar(id, "sm"); });
  if (ids.length > cap) kids.push(h("span", { class: "sb-more", text: "+" + (ids.length - cap) }));
  return h("span", { class: "sb-cluster" }, kids);
}

function icon(path, cls) {
  var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  if (cls) s.setAttribute("class", cls);
  s.innerHTML = path;
  return s;
}

/* Brand marks are drawn with their own fills rather than currentColor,
   because a monochrome Google Pay mark is unrecognisable. */
const BRAND = {
  upi: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="#097939" d="M4 3l5 9-5 9 9-9z"/>' +
    '<path fill="#ed752e" d="M10 3l5 9-5 9 9-9z"/>' +
    '<path fill="currentColor" opacity=".55" d="M17.5 3h1.2l-3.4 18h-1.2z"/></svg>',

  gpay: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.64v3.03h3.88c2.27-2.09 3.54-5.17 3.54-8.91z"/>' +
    '<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A11.99 11.99 0 0 0 12 24z"/>' +
    '<path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.27a12 12 0 0 0 0 10.74l4-3.09z"/>' +
    '<path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>',

  phonepe: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="11" fill="#5F259F"/>' +
    '<path fill="#fff" d="M16.2 8.1c0-.4-.3-.7-.7-.7h-1.3l-.3-1c-.1-.3-.4-.5-.7-.4l-1 .3c-.2.1-.3.3-.2.5l.2.6H8.5c-.4 0-.7.3-.7.7v.6c0 .4.3.7.7.7h.9v2.9c0 1.9 1 3 2.7 3 .5 0 .9-.1 1.4-.3v1.9c0 .3.2.5.5.5h1.1c.3 0 .5-.2.5-.5V8.8h.6v-.7zm-2.7 5.4c-.3.1-.6.2-.9.2-.7 0-1.1-.4-1.1-1.2V9.4h2v4.1z"/></svg>',

  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="#25D366" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.37c0-4.54 3.69-8.23 8.23-8.23 2.2 0 4.26.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23z"/>' +
    '<path fill="#25D366" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/></svg>'
};

function brandIcon(name) {
  var span = document.createElement("span");
  span.className = "sb-brand";
  span.innerHTML = BRAND[name] || "";
  return span;
}

const ICONS = {
  plus:  '<path d="M12 5v14M5 12h14"/>',
  swap:  '<path d="M7 10h14l-4-4M17 14H3l4 4"/>',
  cog:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a7.6 7.6 0 0 0 .1-6l-2-.6-1-1.7.6-2a7.6 7.6 0 0 0-5.2-1.5l-1 1.8-2 .1-1.3-1.5A7.6 7.6 0 0 0 3.2 7l1 1.7-.6 2-1.8.9a7.6 7.6 0 0 0 1.5 5.2l2-.3 1.4 1.4-.2 2a7.6 7.6 0 0 0 5.4.9l.8-1.8 2-.2 1.5 1.3a7.6 7.6 0 0 0 3.1-4.3Z"/>',
  back:  '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  left:  '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>'
};

/* ------------------------------------------------------------
   Time formatting — relative for scanning, exact for trust
   ------------------------------------------------------------ */

function relTime(ms) {
  if (!ms) return "";
  var diff = Date.now() - ms;
  if (diff < 45000) return "just now";
  var mins = Math.round(diff / 60000);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.round(diff / 3600000);
  if (hrs < 24) return hrs + "h ago";
  var days = Math.floor(diff / 86400000);
  if (days === 1) return "yesterday";
  if (days < 7) return days + "d ago";
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function exactTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
  });
}

function monthLabel(key) {
  if (!key) return "All time";
  var parts = key.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
    .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function thisMonth() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

/* ------------------------------------------------------------
   Toasts — every write gets one, and most offer undo
   ------------------------------------------------------------ */

let toastHost = null;

function toast(msg, opts) {
  var o = opts || {};
  if (!toastHost) {
    toastHost = h("div", { class: "sb-toasts", role: "status", "aria-live": "polite" });
    document.body.appendChild(toastHost);
  }
  var node = h("div", { class: "sb-toast" + (o.kind ? " " + o.kind : "") }, [
    h("span", { class: "t-msg", text: msg }),
    o.action && h("button", {
      class: "btn sb-btn tiny", text: o.action.label,
      onclick: function () { dismiss(); o.action.fn(); }
    })
  ]);
  toastHost.appendChild(node);

  var timer = setTimeout(dismiss, o.ms || (o.action ? 5200 : 2600));
  function dismiss() {
    clearTimeout(timer);
    if (!node.parentNode) return;
    node.classList.add("out");
    setTimeout(function () { if (node.parentNode) node.remove(); }, 200);
  }
  return dismiss;
}

/* A write succeeded: confirm it and offer the five-second undo. */
function confirmWrite(msg) {
  var u = data.pendingUndo();
  toast(msg, u ? {
    action: {
      label: "Undo",
      fn: function () {
        data.undo().then(function () { toast("Undone"); }, failed);
      }
    }
  } : null);
}

function failed(err) {
  console.error("[splitbaby]", err);
  var msg = (err && err.message) ? err.message : String(err);
  if (msg === "STALE") msg = "Changed on another device — reopen it";
  toast(msg, { kind: "bad", ms: 4200 });
}

/* ------------------------------------------------------------
   Sheets
   ------------------------------------------------------------ */

function sheet(opts) {
  var o = opts || {};
  var scrim = h("div", { class: "sb-scrim", role: "dialog", "aria-modal": "true" });
  var panel = h("div", { class: "sb-sheet" }, [
    o.title && h("h2", { text: o.title }),
    o.sub && h("p", { class: "s-sub", text: o.sub }),
    o.body,
    o.actions && h("div", { class: "sb-detail-acts", style: "margin-top:0.7rem" }, o.actions)
  ]);
  scrim.appendChild(panel);
  scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  function close() {
    document.removeEventListener("keydown", onKey);
    if (scrim.parentNode) scrim.remove();
  }
  document.body.appendChild(scrim);
  var focusable = panel.querySelector("button, input, select, textarea");
  if (focusable) focusable.focus();
  return close;
}

/* ------------------------------------------------------------
   Convenience: UPI, WhatsApp, clipboard, CSV
   ------------------------------------------------------------ */

/* UPI deep links. The generic upi:// scheme makes the phone show its
   own payment-app chooser; the per-app schemes jump straight into one.
   tez:// is Google Pay India's registered scheme on both Android and
   iOS. WhatsApp deliberately has no entry here: WhatsApp Pay exposes
   no public deep link for paying an arbitrary VPA, so pretending
   otherwise would just open a dead link. It gets a share action
   instead, which is the thing that actually works. */
const UPI_APPS = [
  { id: "upi",     label: "Any UPI app", scheme: "upi://pay" },
  { id: "gpay",    label: "Google Pay",  scheme: "tez://upi/pay" },
  { id: "phonepe", label: "PhonePe",     scheme: "phonepe://pay" },
  { id: "paytm",   label: "Paytm",       scheme: "paytmmp://pay" }
];

function upiQuery(payeeId, paise, note) {
  var p = person(payeeId);
  if (!p || !p.upi) return null;
  return "?pa=" + encodeURIComponent(p.upi) +
         "&pn=" + encodeURIComponent(p.name) +
         "&am=" + (paise / 100).toFixed(2) +
         "&cu=INR&tn=" + encodeURIComponent(note || "Splitbaby");
}

function upiLink(payeeId, paise, note, app) {
  var q = upiQuery(payeeId, paise, note);
  if (!q) return null;
  var scheme = "upi://pay";
  for (var i = 0; i < UPI_APPS.length; i++) {
    if (UPI_APPS[i].id === app) { scheme = UPI_APPS[i].scheme; break; }
  }
  return scheme + q;
}

/* Sends the payment details as a WhatsApp message. The VPA goes in as
   plain text so the recipient can long-press and copy it straight into
   their payment app. */
function upiWhatsAppLink(fromId, payeeId, paise) {
  var p = person(payeeId);
  if (!p) return null;
  var text = formatMoney(paise) + " to " + p.name +
    (p.upi ? "\nUPI: " + p.upi : "") +
    "\n\n(" + personName(fromId) + " → " + p.name + ", via Splitbaby)";
  return "https://wa.me/?text=" + encodeURIComponent(text);
}

/* The pay chooser: a tile per payment app, plus WhatsApp to send the
   details on. Only shown when the payee actually has a UPI ID. */
function payChooser(fromId, payeeId, paise) {
  var p = person(payeeId);
  if (!p || !p.upi) {
    return h("div", { class: "sb-note" }, [
      h("span", { text: "⚠" }),
      h("span", { text: personName(payeeId) + " has no UPI ID saved, so there is nothing to open. Add one in Settings." })
    ]);
  }

  var tiles = UPI_APPS.map(function (app) {
    return h("a", {
      class: "sb-paybtn", href: upiLink(payeeId, paise, "Splitbaby", app.id)
    }, [brandIcon(app.id === "upi" ? "upi" : app.id), h("span", { text: app.label })]);
  });

  tiles.push(h("a", {
    class: "sb-paybtn", target: "_blank", rel: "noopener",
    href: upiWhatsAppLink(fromId, payeeId, paise)
  }, [brandIcon("whatsapp"), h("span", { text: "WhatsApp" })]));

  return h("div", {}, [
    h("div", { class: "sb-paygrid" }, tiles),
    h("button", {
      class: "sb-link", style: "margin-top:0.45rem",
      text: "Copy " + p.name + "’s UPI ID",
      onclick: function () { copyText(p.upi, "Copied " + p.upi); }
    })
  ]);
}

function nudgeLink(fromId, toId, paise) {
  var text = personName(fromId) + ", you owe " + personName(toId) + " " +
    formatMoney(paise) + " on Splitbaby — " + location.href.split("#")[0];
  return "https://wa.me/?text=" + encodeURIComponent(text);
}

function copyText(text, okMsg) {
  function fallback() {
    var ta = h("textarea", { style: "position:fixed;opacity:0;top:0" });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast(okMsg || "Copied"); }
    catch (e) { toast("Could not copy", { kind: "bad" }); }
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast(okMsg || "Copied"); }, fallback);
  } else fallback();
}

function download(name, text, mime) {
  var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = h("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

/* ------------------------------------------------------------
   Derived views of the ledger
   ------------------------------------------------------------ */

function ledger() {
  var rows = data.state.expenses;
  var bal = netBalances(rows);
  return {
    rows: rows,
    balances: bal,
    transfers: simplify(bal),
    direct: directBalances(rows),
    updated: lastActivity(rows)
  };
}

function isAway(id) {
  var p = person(id);
  return !!p && p.flat === AWAY;
}
function isGuest(id) {
  var p = person(id);
  return !!p && p.kind === "visitor";
}

/* The two sites are two lenses on one ledger. A debt between two
   B002 people is B002's business; showing it on the B603 dashboard
   is noise. Anything crossing the flats shows on both. An unknown
   id is kept rather than hidden, so money can never silently vanish
   from both sites at once. */
function touchesUs(t) {
  var a = person(t.from), b = person(t.to);
  if (!a || !b) return true;
  return a.flat === FLAT || b.flat === FLAT;
}

/* Covering means a flatmate here fronts what an outsider owes. That
   only makes sense when this flat actually has a stake in the row. */
function canCover(t) {
  if (!(isGuest(t.from) || isAway(t.from))) return false;
  var a = person(t.from), b = person(t.to);
  return (!!b && b.flat === FLAT) || (!!a && a.flat === FLAT);
}

/* ------------------------------------------------------------
   Shell
   ------------------------------------------------------------ */

const root = document.getElementById("app");

/* Work that needs a measured element runs here, right after the view
   is in the document. rAF would be throttled whenever the frame is not
   visible, which would leave the graph blank. */
let postMount = [];
function onMount(fn) { postMount.push(fn); }

function topbar(title, backTo) {
  var s = data.state;
  var syncText = {
    live: "Live", cached: "Cached", offline: "Offline", demo: "Demo",
    error: "Error", connecting: "Connecting"
  }[s.sync] || s.sync;

  return h("header", { class: "topbar" }, [
    backTo != null
      ? h("a", { class: "sb-iconbtn", href: backTo, "aria-label": "Back" }, icon(ICONS.back))
      : h("span", { class: "logo brand" }, [
          h("span", { class: "l-flat", text: FLATS[FLAT].label }),
          h("span", { class: "l-sep", text: "·" }),
          h("span", { class: "l-d", text: "splitbaby" })
        ]),
    title ? h("span", { class: "sb-label", text: title }) : h("span"),
    h("div", { class: "sb-bar-right" }, [
      h("span", { class: "sb-dot", "data-sync": s.sync, title: syncText, "aria-label": "Sync: " + syncText }),
      h("a", { class: "sb-iconbtn", href: "#/settings", "aria-label": "Settings" }, icon(ICONS.cog))
    ])
  ]);
}

function banner() {
  var s = data.state;
  if (s.mode === "demo") {
    return h("div", { class: "sb-banner" }, [
      h("span", { text: "●" }),
      h("span", { text: "Demo mode — saved on this device only, not synced. Add the Firebase config to go live." })
    ]);
  }
  if (s.sync === "error") {
    return h("div", { class: "sb-banner bad" }, [
      h("span", { text: "⚠" }),
      h("span", { text: s.error || "Cannot reach the ledger." }),
      h("button", { class: "sb-link b-x", text: "Retry", onclick: function () { location.reload(); } })
    ]);
  }
  if (s.sync === "offline") {
    return h("div", { class: "sb-banner warn" }, [
      h("span", { text: "○" }),
      h("span", { text: "Offline — changes are queued and will sync when you are back." })
    ]);
  }
  if (s.fromMirror) {
    return h("div", { class: "sb-banner warn" }, [
      h("span", { text: "○" }),
      h("span", { text: "Showing this device’s last copy while the ledger loads…" })
    ]);
  }
  return null;
}

function footer() {
  return h("div", { class: "sb-foot" }, [
    h("div", { text: FLATS[FLAT].label + " · splitbaby" }),
    h("div", { text: "Unlimited expenses. No spend limits, ever." })
  ]);
}

function skeleton() {
  return h("div", { class: "stack" }, [
    h("section", { class: "card" }, [h("div", { class: "sb-skel line" }), h("div", { class: "sb-skel block" })]),
    h("section", { class: "card" }, [h("div", { class: "sb-skel block" })])
  ]);
}

/* ============================================================
   CARD 1 — ACT AS
   ============================================================ */

function cardActAs(L) {
  var who = me();
  var net = Math.round(L.balances[who] || 0);

  var tone = net > 0 ? "good" : (net < 0 ? "bad" : "flat");
  var heroNum = net === 0 ? "All settled" : formatMoney(Math.abs(net));
  var heroTxt = net > 0 ? "owed to you" : (net < 0 ? "you owe" : "nothing outstanding");

  return h("section", { class: "card" }, [
    h("div", { class: "sb-head" }, [
      h("span", { class: "sb-label", text: "Acting as" }),
      h("span", { class: "sb-meta", text: data.state.mode === "demo" ? "demo" : "" })
    ]),

    h("div", { class: "sb-whogrid" }, membersOf(FLAT).map(function (p) {
      var pn = Math.round(L.balances[p.id] || 0);
      return h("button", {
        class: "sb-who", "aria-pressed": p.id === who ? "true" : "false",
        onclick: function () { setMe(p.id); }
      }, [
        avatar(p.id),
        h("span", { text: p.name }),
        h("span", {
          class: "sb-who-net num",
          text: pn === 0 ? "—"
            : (pn > 0 ? "+" : "−") + formatMoney(Math.round(Math.abs(pn) / 100) * 100, { bare: true })
        })
      ]);
    })),

    h("div", { class: "sb-hero " + tone }, [
      h("span", { class: "sb-hero-num money", text: heroNum }),
      h("span", { class: "sb-hero-txt", text: heroTxt })
    ]),

    h("div", { class: "sb-actions" }, [
      h("a", { class: "btn sb-btn primary", href: "#/add?as=" + who }, [icon(ICONS.plus), "Add expense"]),
      h("a", { class: "btn sb-btn", href: "#/settle?from=" + who }, [icon(ICONS.swap), "Settle up"])
    ])
  ]);
}

/* ============================================================
   CARD 2 — graph + simplified list
   ============================================================ */

let expandedGroup = null;

function cardBalances(L) {
  var who = me();
  /* the budget only needs a rough width; the render measures exactly */
  var approxW = Math.max(240, (root.clientWidth || 360) - 44);
  var nodes = collapseGroups(L.balances, { homeFlat: FLAT, guestBudget: guestBudget(approxW) });

  var graphHost = h("div");
  var spendStats = monthStats(L.rows, prefs.month, null);

  /* "Spend" relabels the same layout with each party's share of
     the period, and draws what the selected person paid for. */
  var graphNodes = nodes;
  var graphEdges;
  if (prefs.graphMode === "spend") {
    graphNodes = {
      tier1: nodes.tier1.map(function (n) { return spendNode(n, spendStats); }),
      tier2: nodes.tier2.map(function (n) { return spendNode(n, spendStats); })
    };
    graphEdges = mapEdges(spendTransfers(L.rows, who), graphNodes);
  } else {
    graphEdges = mapEdges(L.transfers, nodes);
  }

  function draw() {
    renderGraph(graphHost, {
      nodes: graphNodes, edges: graphEdges, selected: who,
      width: graphHost.clientWidth || approxW,
      plain: prefs.graphMode === "spend",
      onSelect: function (n) {
        if (n.kind === "group") {
          expandedGroup = expandedGroup === n.id ? null : n.id;
          render();
        } else if (n.id !== who && person(n.id) && person(n.id).flat === FLAT && person(n.id).kind === "member") {
          setMe(n.id);
        } else {
          openPerson(n.id);
        }
      }
    });
  }
  onMount(draw);

  /* ---- the simplified list, groups always expanded ---- */
  var scope = prefs.debtScope;
  var rows = L.transfers.filter(touchesUs);
  if (scope === "mine") {
    rows = rows.filter(function (t) { return t.from === who || t.to === who; });
  }
  if (expandedGroup) {
    var ids = membersOfNode(nodes, expandedGroup);
    rows = L.transfers.filter(function (t) {
      return ids.indexOf(t.from) >= 0 || ids.indexOf(t.to) >= 0;
    });
  }

  var mineCount = L.transfers.filter(function (t) { return t.from === who || t.to === who; }).length;

  return h("section", { class: "card" }, [
    h("div", { class: "sb-head" }, [
      h("span", { class: "sb-label", text: prefs.graphMode === "owes" ? "Who owes whom" : "Who spent what" }),
      h("div", { style: "display:flex;align-items:center;gap:0.4rem" }, [
        h("div", { class: "sb-seg" }, [
          segBtn("Owes", prefs.graphMode === "owes", function () { prefs.graphMode = "owes"; savePrefs(); render(); }),
          segBtn("Spend", prefs.graphMode === "spend", function () { prefs.graphMode = "spend"; savePrefs(); render(); })
        ])
      ])
    ]),

    graphHost,

    L.updated ? h("div", { class: "sb-meta", style: "text-align:right;margin-top:0.2rem", text: "Updated " + exactTime(L.updated) }) : null,

    h("div", { class: "sb-rule" }),

    h("div", { class: "sb-head" }, [
      h("span", { class: "sb-label", text: expandedGroup ? "Simplified · group" : "Simplified" }),
      h("div", { style: "display:flex;align-items:center;gap:0.35rem" }, [
        expandedGroup && h("button", { class: "sb-link", text: "clear", onclick: function () { expandedGroup = null; render(); } }),
        !expandedGroup && mineCount > 0 && h("div", { class: "sb-seg" }, [
          segBtn("All", scope === "all", function () { prefs.debtScope = "all"; savePrefs(); render(); }),
          segBtn("Mine", scope === "mine", function () { prefs.debtScope = "mine"; savePrefs(); render(); })
        ])
      ])
    ]),

    rows.length ? h("div", { class: "sb-debts" }, rows.map(function (t) { return debtRow(t, who); }))
      : h("div", { class: "sb-empty" }, [
          h("span", { class: "e-big", text: "✓" }),
          h("span", { text: L.transfers.length ? "Nothing here for this view." : "Everyone is square." })
        ]),

    rows.length > 1 ? h("div", { class: "sb-detail-acts" }, [
      L.transfers.filter(function (t) { return t.from === who; }).length > 1 &&
        h("button", { class: "btn sb-btn tiny", text: "Settle all mine", onclick: function () { settleAllMine(L, who); } }),
      h("button", { class: "btn sb-btn tiny", text: "Copy summary", onclick: function () { copySummary(L); } })
    ]) : null
  ]);
}

function spendNode(n, stats) {
  var total = 0;
  n.members.forEach(function (m) { total += Math.round(stats.shareBy[m] || 0); });
  return Object.assign({}, n, { net: total });
}

/* Edges for Spend mode: what the selected person paid, and who
   it went to. This is the literal "highlight their expenses". */
function spendTransfers(rows, who) {
  var out = {};
  live(rows).forEach(function (e) {
    if (!isSpend(e) || e.paidBy !== who) return;
    if (prefs.month && String(e.date || "").slice(0, 7) !== prefs.month) return;
    Object.keys(e.splits).forEach(function (q) {
      if (q === who) return;
      out[q] = (out[q] || 0) + e.splits[q];
    });
  });
  return Object.keys(out).map(function (q) {
    return { from: who, to: q, amountPaise: out[q] };
  });
}

function segBtn(label, on, fn) {
  return h("button", { type: "button", text: label, "aria-pressed": on ? "true" : "false", onclick: fn });
}

function debtRow(t, who) {
  var mine = t.from === who || t.to === who;
  var primary;

  if (t.from === who) {
    primary = h("button", { class: "btn sb-btn tiny", text: "Settle", onclick: function (e) { e.stopPropagation(); openSettle(t); } });
  } else if (canCover(t)) {
    primary = h("button", { class: "btn sb-btn tiny", text: "Cover", onclick: function (e) { e.stopPropagation(); openCover(t); } });
  } else {
    primary = h("button", { class: "btn sb-btn tiny", text: "Paid", onclick: function (e) { e.stopPropagation(); markPaid(t); } });
  }

  return h("div", {
    class: "sb-debt" + (mine ? " mine" : ""), role: "button", tabindex: "0",
    onclick: function () { openDebt(t, who); },
    onkeydown: function (e) { if (e.key === "Enter") openDebt(t, who); }
  }, [
    h("span", { class: "sb-flow" }, [
      avatar(t.from), h("span", { class: "sb-nm", text: personName(t.from) }),
      h("span", { class: "sb-arrow", text: "→" }),
      avatar(t.to), h("span", { class: "sb-nm", text: personName(t.to) })
    ]),
    h("span", { class: "sb-amt money" + (t.to === who ? " good" : (t.from === who ? " bad" : "")), text: formatMoney(t.amountPaise) }),
    h("span", { class: "sb-row-act" }, [primary])
  ]);
}

/* ============================================================
   Settlement flows — all four
   ============================================================ */

function openDebt(t, who) {
  var acts = [];
  acts.push(h("button", {
    class: "btn sb-btn tiny", text: "Mark paid",
    onclick: function () { close(); markPaid(t); }
  }));
  if (canCover(t)) {
    acts.push(h("button", {
      class: "btn sb-btn tiny", text: "Cover it",
      onclick: function () { close(); openCover(t); }
    }));
  }
  if (t.from !== who) {
    acts.push(h("a", {
      class: "btn sb-btn tiny wa", target: "_blank", rel: "noopener",
      href: nudgeLink(t.from, t.to, t.amountPaise), text: "Nudge"
    }));
  }
  acts.push(h("button", { class: "btn sb-btn tiny", text: "Close", onclick: function () { close(); } }));

  var close = sheet({
    title: personName(t.from) + " → " + personName(t.to),
    sub: formatMoney(t.amountPaise) + " after simplifying.",
    body: h("div", { class: "stack" }, [
      h("span", { class: "sb-label", text: "Pay " + formatMoney(t.amountPaise) + " to " + personName(t.to) }),
      payChooser(t.from, t.to, t.amountPaise),
      h("div", { class: "sb-note info" }, h("span", {
        text: "Opening a payment app does not clear the debt — come back and tap “Mark paid”. That way a cancelled payment never settles anything."
      }))
    ]),
    actions: acts
  });
}

function openSettle(t) {
  var amountInput;
  var close = sheet({
    title: "Settle up",
    sub: personName(t.from) + " pays " + personName(t.to),
    body: h("div", { class: "stack" }, [
      h("div", { class: "sb-field" }, [
        h("label", { text: "Amount" }),
        h("div", { class: "sb-amount" }, [
          h("span", { class: "cur", text: CURRENCY }),
          (amountInput = h("input", {
            type: "text", inputmode: "decimal", value: paiseToInput(t.amountPaise),
            "aria-label": "Amount"
          }))
        ])
      ]),
      h("span", { class: "sb-label", text: "Open a payment app" }),
      payChooser(t.from, t.to, t.amountPaise)
    ]),
    actions: [
      h("button", {
        class: "btn sb-btn primary", text: "Record it",
        onclick: function () {
          var paise = parseAmount(amountInput.value);
          if (!(paise > 0)) return toast("Enter an amount", { kind: "bad" });
          if (paise > MAX_PAISE) return toast("That is over the ₹1,00,000 limit", { kind: "bad" });
          close();
          data.addSettlement({ from: t.from, to: t.to, amountPaise: paise, by: me(), flat: FLAT })
            .then(function () { confirmWrite(personName(t.from) + " paid " + personName(t.to)); }, failed);
        }
      }),
      h("button", { class: "btn sb-btn", text: "Cancel", onclick: function () { close(); } })
    ]
  });
}

function markPaid(t) {
  data.addSettlement({ from: t.from, to: t.to, amountPaise: t.amountPaise, by: me(), flat: FLAT })
    .then(function () {
      confirmWrite(personName(t.from) + " paid " + personName(t.to) + " " + formatMoney(t.amountPaise));
    }, failed);
}

/* Cover: a flat member absorbs an outsider's debt. Recorded as a
   settlement from the debtor to the covering member, which clears
   the debtor and leaves the member carrying it — and that then
   simplifies against the real creditors automatically. */
function openCover(t) {
  var chosen = me();
  var options = membersOf(FLAT).filter(function (p) { return isActive(p.id); });

  var grid = h("div", { class: "sb-whogrid" }, options.map(function (p) {
    return h("button", {
      class: "sb-who", "aria-pressed": p.id === chosen ? "true" : "false",
      onclick: function () {
        chosen = p.id;
        Array.prototype.forEach.call(grid.children, function (c, i) {
          c.setAttribute("aria-pressed", options[i].id === chosen ? "true" : "false");
        });
      }
    }, [avatar(p.id), h("span", { text: p.name })]);
  }));

  var close = sheet({
    title: "Cover " + personName(t.from) + "’s debt",
    sub: formatMoney(t.amountPaise) + " owed to " + personName(t.to) +
         ". Whoever covers it takes the debt on themselves.",
    body: h("div", { class: "stack" }, [
      h("span", { class: "sb-label", text: "Covered by" }),
      grid,
      h("div", { class: "sb-note info" }, h("span", {
        text: personName(t.from) + " goes to zero, and the covering flatmate owes " +
              formatMoney(t.amountPaise) + " instead."
      }))
    ]),
    actions: [
      h("button", {
        class: "btn sb-btn primary", text: "Cover it",
        onclick: function () {
          if (chosen === t.from) return toast("Pick someone other than the debtor", { kind: "bad" });
          close();
          data.addSettlement({
            from: t.from, to: chosen, amountPaise: t.amountPaise,
            coverFor: t.from, by: chosen, flat: FLAT
          }).then(function () {
            confirmWrite(personName(chosen) + " covered " + personName(t.from) + "’s " + formatMoney(t.amountPaise));
          }, failed);
        }
      }),
      h("button", { class: "btn sb-btn", text: "Cancel", onclick: function () { close(); } })
    ]
  });
}

function settleAllMine(L, who) {
  var mine = L.transfers.filter(function (t) { return t.from === who; });
  if (!mine.length) return toast("You owe nothing");
  var total = mine.reduce(function (s, t) { return s + t.amountPaise; }, 0);

  var close = sheet({
    title: "Settle all — " + formatMoney(total),
    sub: "Records " + mine.length + " payments from " + personName(who) + " in one go.",
    body: h("div", { class: "sb-debts" }, mine.map(function (t) {
      return h("div", { class: "sb-debt" }, [
        h("span", { class: "sb-flow" }, [avatar(t.to), h("span", { class: "sb-nm", text: personName(t.to) })]),
        h("span", { class: "sb-amt money", text: formatMoney(t.amountPaise) })
      ]);
    })),
    actions: [
      h("button", {
        class: "btn sb-btn primary", text: "Record all " + mine.length,
        onclick: function () {
          close();
          data.settleAll(mine, who).then(function () {
            confirmWrite("Settled " + mine.length + " debts · " + formatMoney(total));
          }, failed);
        }
      }),
      h("button", { class: "btn sb-btn", text: "Cancel", onclick: function () { close(); } })
    ]
  });
}

function copySummary(L) {
  var shown = L.transfers.filter(touchesUs);
  var lines = [FLATS[FLAT].label + " splitbaby — who owes whom"];
  if (!shown.length) lines.push("Everyone is square.");
  shown.forEach(function (t) {
    lines.push(personName(t.from) + " → " + personName(t.to) + "  " + formatMoney(t.amountPaise));
  });
  lines.push("");
  lines.push("Updated " + exactTime(L.updated || Date.now()));
  copyText(lines.join("\n"), "Summary copied — paste it in the group");
}

/* ============================================================
   CARD 3 — recent expenses
   ============================================================ */

let openExpense = null;

function expenseRow(e, who, opts) {
  var o = opts || {};
  var isSettle = e.kind === "settlement";
  var cat = isSettle ? null : category(e.category);
  var mine = Math.round(e.splits[who] || 0);
  var youPaid = e.paidBy === who;

  var youBit = null;
  if (isSettle) {
    youBit = null;
  } else if (youPaid) {
    var lent = Math.round(e.amountPaise) - mine;
    youBit = lent > 0 ? h("span", { class: "e-you lent", text: "you lent " + formatMoney(lent) }) : null;
  } else if (mine > 0) {
    youBit = h("span", { class: "e-you owe", text: "you owe " + formatMoney(mine) });
  }

  var sub = isSettle
    ? [h("span", { text: e.coverFor ? "covered by " + personName(e.splits && Object.keys(e.splits)[0]) : "settled up" })]
    : [
        h("span", { text: personName(e.paidBy) + " paid" }),
        h("span", { text: "·" }),
        h("span", { text: e.participants.length + (e.participants.length === 1 ? " way" : " ways") }),
        youBit && h("span", { text: "·" }), youBit
      ];

  var kids = [
    h("span", { class: "e-ico", text: isSettle ? (e.coverFor ? COVER_ICON : SETTLE_ICON) : cat.icon }),
    h("span", { class: "e-title", text: e.title || (cat ? cat.label : "Expense") }),
    h("span", { class: "e-amt money", text: formatMoney(e.amountPaise) }),
    h("span", { class: "e-sub" }, sub),
    h("span", { class: "e-when", title: exactTime(e.at), text: relTime(e.at) })
  ];

  if (openExpense === e.id) kids.push(expenseDetail(e, who));

  return h("div", {
    class: "sb-exp" + (isSettle ? " settle" : "") + (e.deleted ? " deleted" : ""),
    role: "button", tabindex: "0",
    onclick: function () { openExpense = openExpense === e.id ? null : e.id; render(); },
    onkeydown: function (ev) { if (ev.key === "Enter") { openExpense = openExpense === e.id ? null : e.id; render(); } }
  }, kids);
}

function expenseDetail(e, who) {
  var order = e.participants.slice().sort(function (a, b) {
    return (a === e.paidBy ? -1 : b === e.paidBy ? 1 : personName(a).localeCompare(personName(b)));
  });

  return h("div", { class: "sb-exp-detail", onclick: function (ev) { ev.stopPropagation(); } }, [
    h("div", { class: "sb-label", text: e.kind === "settlement" ? "Transfer" : "Split · " + e.splitMode }),

    h("div", { class: "stack", style: "gap:0.18rem" }, order.map(function (id) {
      return h("div", { class: "sb-split-row" + (id === e.paidBy ? " payer" : "") }, [
        h("span", { class: "s-nm" }, [avatar(id, "sm"), h("span", { text: personName(id) + (id === e.paidBy ? " · paid" : "") })]),
        h("span", { class: "money", text: formatMoney(e.splits[id] || 0) })
      ]);
    })),

    e.note ? h("div", { class: "sb-hist", text: "“" + e.note + "”" }) : null,

    h("div", { class: "sb-hist", text: exactTime(e.at) + " · added by " + personName(e.createdBy || e.paidBy) }),

    e.history && e.history.length > 1
      ? h("details", { class: "sb-fold" }, [
          h("summary", { text: "History (" + e.history.length + ")" }),
          h("div", { class: "sb-fold-body stack", style: "gap:0.15rem" }, e.history.slice().reverse().map(function (x) {
            return h("div", { class: "sb-hist", text: relTime(x.at) + " · " + personName(x.by) + " " + x.action + (x.summary ? " · " + x.summary : "") });
          }))
        ])
      : null,

    h("div", { class: "sb-detail-acts" }, [
      !e.deleted && isSpend(e) && h("a", {
        class: "btn sb-btn tiny", href: "#/add?repeat=" + e.id, text: "Repeat"
      }),
      !e.deleted && h("a", { class: "btn sb-btn tiny", href: "#/expense/" + e.id, text: "Edit" }),
      !e.deleted && h("button", {
        class: "btn sb-btn tiny", text: "Delete",
        onclick: function () {
          data.softDelete(e.id, me()).then(function () { confirmWrite("Deleted"); }, failed);
        }
      }),
      e.deleted && h("button", {
        class: "btn sb-btn tiny", text: "Restore",
        onclick: function () {
          data.restoreExpense(e.id, me()).then(function () { toast("Restored"); }, failed);
        }
      })
    ])
  ]);
}

function cardRecent(L) {
  var who = me();
  var rows = L.rows.filter(function (e) { return !e.deleted; }).slice(0, 8);

  return h("section", { class: "card" }, [
    h("div", { class: "sb-head" }, [
      h("span", { class: "sb-label", text: "Recent" }),
      h("a", { class: "sb-link", href: "#/all", text: "See all →" })
    ]),
    rows.length
      ? h("div", {}, rows.map(function (e) { return expenseRow(e, who); }))
      : h("div", { class: "sb-empty" }, [
          h("span", { class: "e-big", text: "\u{1F9FE}" }),
          h("span", { text: "No expenses yet — add the first one." })
        ])
  ]);
}

/* ============================================================
   CARD 4 — the month
   ============================================================ */

function cardMonth(L) {
  var who = me();
  var months = monthsPresent(L.rows);
  var current = prefs.month === undefined ? thisMonth() : prefs.month;
  if (current === null) current = null;
  var stats = monthStats(L.rows, current, FLAT);
  var all = monthStats(L.rows, current, null);

  var idx = months.indexOf(current);
  function step(d) {
    if (current === null) { prefs.month = months[0] || thisMonth(); }
    else {
      var next = months[idx + d];
      prefs.month = next || current;
    }
    savePrefs(); render();
  }

  var paid = all.paidBy;
  var top = Object.keys(paid).sort(function (a, b) { return paid[b] - paid[a]; });
  var max = top.length ? paid[top[0]] : 0;

  var cats = Object.keys(all.byCategory).sort(function (a, b) { return all.byCategory[b] - all.byCategory[a]; }).slice(0, 4);

  return h("section", { class: "card" }, [
    h("div", { class: "sb-head" }, [
      h("div", { class: "sb-stepper" }, [
        h("button", { class: "sb-iconbtn", "aria-label": "Previous month", onclick: function () { step(1); } }, icon(ICONS.left)),
        h("span", { class: "m-name", text: current ? monthLabel(current) : "All time" }),
        h("button", { class: "sb-iconbtn", "aria-label": "Next month", onclick: function () { step(-1); } }, icon(ICONS.right))
      ]),
      h("button", {
        class: "sb-link", text: current ? "All time" : "This month",
        onclick: function () { prefs.month = current ? null : thisMonth(); savePrefs(); render(); }
      })
    ]),

    h("div", { class: "sb-mstat" }, [
      h("span", { class: "m-big money", text: formatMoney(stats.total) }),
      h("span", { class: "m-sub", text: FLATS[FLAT].label + " spend" }),
      h("span", { class: "m-sub", text: "·" }),
      h("span", { class: "m-sub money", text: "your share " + formatMoney(all.shareBy[who] || 0) }),
      h("span", { class: "m-sub", text: "·" }),
      h("span", { class: "m-sub", text: stats.count + " expense" + (stats.count === 1 ? "" : "s") })
    ]),

    top.length ? h("div", { class: "sb-bars" }, top.slice(0, 6).map(function (id) {
      return h("div", { class: "sb-bar-row" + (id === who ? " sel" : "") }, [
        h("span", { class: "b-nm", text: personName(id) }),
        h("span", { class: "sb-bar-track" },
          h("span", {
            class: "sb-bar-fill",
            style: "width:" + (max ? Math.max(3, Math.round(paid[id] / max * 100)) : 0) + "%;--bar:" + personColor(id)
          })),
        h("span", { class: "b-amt", text: formatMoney(paid[id], { bare: true }) })
      ]);
    })) : h("div", { class: "sb-empty", text: "Nothing spent in this period." }),

    cats.length ? h("div", { class: "sb-cats" }, cats.map(function (c) {
      return h("span", { class: "sb-cat", text: category(c).icon + " " + category(c).label + " " + formatMoney(all.byCategory[c]) });
    })) : null
  ]);
}

/* ============================================================
   CARD 5 — activity
   ============================================================ */

function cardActivity(L) {
  var feed = [];
  L.rows.forEach(function (e) {
    (e.history || []).forEach(function (x) {
      feed.push({ at: x.at, by: x.by, action: x.action, summary: x.summary, title: e.title, id: e.id });
    });
  });
  feed.sort(function (a, b) { return b.at - a.at; });
  if (!feed.length) return null;

  return h("details", { class: "card" }, [
    h("summary", { style: "cursor:pointer;list-style:none" },
      h("div", { class: "sb-head", style: "margin:0" }, [
        h("span", { class: "sb-label", text: "Activity" }),
        h("span", { class: "sb-meta", text: feed.length + " events" })
      ])),
    h("div", { class: "stack", style: "gap:0.2rem;margin-top:0.5rem" }, feed.slice(0, 25).map(function (x) {
      return h("div", { class: "sb-hist" }, [
        h("span", { text: personName(x.by) + " " + x.action + " " }),
        h("b", { text: x.title || "an expense" }),
        h("span", { text: (x.summary ? " · " + x.summary : "") + " · " + relTime(x.at) })
      ]);
    }))
  ]);
}

/* ============================================================
   Screen — HOME
   ============================================================ */

function screenHome() {
  var L = ledger();
  return [
    topbar(null, null),
    h("div", { class: "container" }, [
      banner(),
      h("div", { class: "stack" }, [
        cardActAs(L),
        cardBalances(L),
        cardRecent(L),
        cardMonth(L),
        cardActivity(L)
      ]),
      footer()
    ])
  ];
}

/* ============================================================
   Screen — ADD / EDIT EXPENSE
   ============================================================ */

let form = null;

function screenAdd(params) {
  var editing = params.edit ? data.expenseById(params.edit) : null;
  var repeat = params.repeat ? data.expenseById(params.repeat) : null;
  var src = editing || repeat;

  var payer = params.as || (src && src.paidBy) || me();

  /* every own-flat member starts selected, which is the common
     case and the thing Splitwise makes you do by hand */
  var chosen = {};
  if (src) {
    src.participants.forEach(function (id) { chosen[id] = true; });
  } else {
    membersOf(FLAT).forEach(function (p) { if (isActive(p.id)) chosen[p.id] = true; });
  }

  form = {
    editing: editing,
    amount: src ? paiseToInput(src.amountPaise) : "",
    title: src ? (repeat ? src.title : src.title) : "",
    category: src ? (src.category || DEFAULT_CATEGORY) : DEFAULT_CATEGORY,
    note: editing ? editing.note : "",
    date: editing ? editing.date : data.isoDate(new Date()),
    payer: payer,
    mode: src && !repeat ? src.splitMode : "equal",
    chosen: chosen,
    exact: {},
    shares: {}
  };

  if (editing && editing.splitMode === "exact") form.exact = Object.assign({}, editing.splits);
  if (editing && editing.splitMode === "shares" && editing.shares) form.shares = Object.assign({}, editing.shares);

  var body = h("div", { class: "container" });
  var host = h("div");
  body.appendChild(host);
  drawForm(host, params);

  return [topbar(editing ? "Edit" : "Add expense", "#/"), body];
}

function selectedIds() {
  return Object.keys(form.chosen).filter(function (id) { return form.chosen[id]; });
}

function currentSplits() {
  var paise = parseAmount(form.amount);
  if (!(paise > 0)) return {};
  var extra = form.mode === "exact" ? form.exact : (form.mode === "shares" ? form.shares : null);
  return buildSplits(form.mode, paise, selectedIds(), form.payer, extra);
}

function drawForm(host, params) {
  host.innerHTML = "";
  var paise = parseAmount(form.amount);
  var ids = selectedIds();
  var splits = currentSplits();

  var homeMembers = membersOf(FLAT).filter(function (p) { return isActive(p.id); });
  var awayPeople = peopleOf(AWAY).filter(function (p) { return isActive(p.id); });
  var homeGuests = guestsOf(FLAT).filter(function (p) { return isActive(p.id); });

  var awayOn = awayPeople.filter(function (p) { return form.chosen[p.id]; }).length;
  var guestOn = homeGuests.filter(function (p) { return form.chosen[p.id]; }).length;

  function redraw() { drawForm(host, params); }

  function toggle(id) {
    form.chosen[id] = !form.chosen[id];
    if (!form.chosen[id]) { delete form.exact[id]; delete form.shares[id]; }
    redraw();
  }

  function personToggle(p, cls) {
    return h("button", {
      type: "button", class: "sb-toggle" + (cls ? " " + cls : ""),
      "aria-pressed": form.chosen[p.id] ? "true" : "false",
      onclick: function () { toggle(p.id); }
    }, [avatar(p.id), h("span", { text: p.name })]);
  }

  /* ---- validation, exactly what the save button gates on ---- */
  var problems = [];
  if (!(paise > 0)) problems.push("Enter an amount");
  else if (paise > MAX_PAISE) problems.push("Over the " + formatMoney(MAX_PAISE) + " limit");
  if (!form.title.trim()) problems.push("Give it a title");
  if (!ids.length) problems.push("Pick at least one person");
  if (paise > 0 && ids.length && form.mode === "exact") {
    var rem = exactSplitRemainder(paise, form.exact);
    if (rem !== 0) problems.push(rem > 0 ? formatMoney(rem) + " left to assign" : formatMoney(-rem) + " over");
  }
  if (paise > 0 && ids.length && form.mode === "shares") {
    var tw = ids.reduce(function (s, id) { return s + (Number(form.shares[id]) || 0); }, 0);
    if (!(tw > 0)) problems.push("Give someone a share");
  }

  var dup = (!form.editing && paise > 0 && form.title.trim())
    ? data.findDuplicate(form.title, paise) : null;

  var presets = data.state.presets.filter(function (p) { return !p.hidden; });

  host.appendChild(h("div", { class: "stack" }, [

    /* ---- quick-add presets ---- */
    presets.length ? h("section", { class: "card" }, [
      h("span", { class: "sb-label", text: "Quick add" }),
      h("div", { class: "sb-presets", style: "margin-top:0.4rem;margin-bottom:0" }, presets.map(function (p) {
        return h("button", { type: "button", class: "sb-preset", onclick: function () {
          form.amount = paiseToInput(p.amountPaise);
          form.title = p.label;
          form.category = p.category || DEFAULT_CATEGORY;
          redraw();
        } }, [
          h("span", { text: category(p.category).icon + " " + p.label + " " }),
          h("span", { class: "p-amt", text: formatMoney(p.amountPaise) })
        ]);
      }))
    ]) : null,

    /* ---- what and how much ---- */
    h("section", { class: "card stack" }, [
      h("div", { class: "sb-amount" }, [
        h("span", { class: "cur", text: CURRENCY }),
        h("input", {
          type: "text", inputmode: "decimal", placeholder: "0", value: form.amount,
          "aria-label": "Amount",
          oninput: function (e) { form.amount = e.target.value; form.dirty = true; refreshDerived(); }
        })
      ]),

      h("div", { class: "sb-field" }, [
        h("label", { text: "What for" }),
        h("input", {
          class: "sb-input", type: "text", maxlength: "80", value: form.title,
          placeholder: "Groceries, Zomato, water can…",
          oninput: function (e) {
            form.title = e.target.value;
            form.dirty = true;
            var remembered = prefs.catMemory[e.target.value.trim().toLowerCase()];
            if (remembered) form.category = remembered;
            refreshDerived();
          }
        })
      ]),

      h("div", { class: "sb-field" }, [
        h("label", { text: "Category" }),
        h("div", { class: "sb-catgrid" }, CATEGORIES.map(function (c) {
          return h("button", {
            type: "button", class: "sb-catbtn",
            "aria-pressed": form.category === c.id ? "true" : "false",
            onclick: function () { form.category = c.id; redraw(); }
          }, [h("span", { text: c.icon }), h("span", { text: c.label })]);
        }))
      ]),

      h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:0.4rem" }, [
        h("div", { class: "sb-field" }, [
          h("label", { text: "Date" }),
          h("input", {
            class: "sb-input", type: "date", value: form.date,
            onchange: function (e) { form.date = e.target.value || data.isoDate(new Date()); }
          })
        ]),
        h("div", { class: "sb-field" }, [
          h("label", { text: "Paid by" }),
          h("select", {
            class: "sb-select",
            onchange: function (e) { form.payer = e.target.value; redraw(); }
          }, PEOPLE.filter(function (p) { return isActive(p.id); }).map(function (p) {
            return h("option", { value: p.id, selected: p.id === form.payer ? "selected" : false, text: p.name });
          }))
        ])
      ]),

      h("div", { class: "sb-field" }, [
        h("label", { text: "Note (optional)" }),
        h("input", {
          class: "sb-input", type: "text", maxlength: "300", value: form.note,
          placeholder: "anything worth remembering",
          oninput: function (e) { form.note = e.target.value; }
        })
      ])
    ]),

    /* ---- who splits it ---- */
    h("section", { class: "card" }, [
      h("div", { class: "sb-head" }, [
        h("span", { class: "sb-label", text: ids.length + " of " + (homeMembers.length + awayPeople.length + homeGuests.length) + " selected" }),
        h("button", {
          type: "button", class: "sb-link",
          text: ids.length ? "Unselect all" : "Select all",
          onclick: function () {
            var on = ids.length === 0;
            form.chosen = {};
            if (on) {
              homeMembers.concat(awayPeople, homeGuests).forEach(function (p) { form.chosen[p.id] = true; });
            }
            redraw();
          }
        })
      ]),

      h("div", { class: "sb-toggles" }, homeMembers.map(function (p) { return personToggle(p); })),

      /* the other flat, folded */
      h("details", { class: "sb-fold", open: awayOn ? "open" : false }, [
        h("summary", {}, [
          h("span", { text: "Add from " + FLATS[AWAY].label }),
          awayOn ? h("span", { class: "sb-count", text: String(awayOn) }) : null
        ]),
        h("div", { class: "sb-fold-body sb-toggles" }, awayPeople.map(function (p) {
          return personToggle(p, p.kind === "visitor" ? "guest" : "");
        }))
      ]),

      /* visitors LAST, after the other flat, with the new-guest
         form folded inside this same section */
      h("details", { class: "sb-fold", open: guestOn ? "open" : false }, [
        h("summary", {}, [
          h("span", { text: "Common visitors" }),
          guestOn ? h("span", { class: "sb-count", text: String(guestOn) }) : null
        ]),
        h("div", { class: "sb-fold-body stack" }, [
          h("div", { class: "sb-toggles" }, homeGuests.map(function (p) { return personToggle(p, "guest"); })),
          newGuestForm(redraw)
        ])
      ])
    ]),

    /* ---- how it splits ---- */
    h("section", { class: "card stack" }, [
      h("div", { class: "sb-head" }, [
        h("span", { class: "sb-label", text: "Split" }),
        h("div", { class: "sb-seg" }, [
          segBtn("Equal", form.mode === "equal", function () { form.mode = "equal"; redraw(); }),
          segBtn("Exact", form.mode === "exact", function () {
            form.mode = "exact";
            if (paise > 0 && ids.length) form.exact = equalSplit(paise, ids, form.payer);
            redraw();
          }),
          segBtn("Shares", form.mode === "shares", function () {
            form.mode = "shares";
            ids.forEach(function (id) { if (!form.shares[id]) form.shares[id] = 1; });
            redraw();
          })
        ])
      ]),

      form.mode === "equal"
        ? h("div", { class: "sb-preview", id: "sb-prev" }, previewText(paise, ids, splits))
        : h("div", { class: "sb-splitrows" }, ids.map(function (id) {
            var isShares = form.mode === "shares";
            return h("div", { class: "sb-splitrow" }, [
              h("span", { class: "sr-nm" }, [avatar(id, "sm"), h("span", { text: personName(id) })]),
              h("input", {
                class: "sb-input", type: "text", inputmode: "decimal",
                "aria-label": (isShares ? "Shares for " : "Amount for ") + personName(id),
                value: isShares
                  ? String(form.shares[id] == null ? "" : form.shares[id])
                  : (form.exact[id] != null ? paiseToInput(form.exact[id]) : ""),
                oninput: function (e) {
                  if (isShares) form.shares[id] = Number(e.target.value) || 0;
                  else {
                    var v = parseAmount(e.target.value);
                    form.exact[id] = Number.isNaN(v) ? 0 : v;
                  }
                  refreshDerived();
                }
              })
            ]);
          })),

      form.mode !== "equal" ? h("div", { class: "sb-preview", id: "sb-prev" }, previewText(paise, ids, splits)) : null
    ]),

    h("div", { id: "sb-dup" }, dupNote(dup)),

    problems.length ? h("div", { class: "sb-note bad" }, [
      h("span", { text: "•" }),
      h("span", { text: problems.join(" · ") })
    ]) : null,

    h("div", { class: "sb-savebar" }, [
      h("a", { class: "btn sb-btn", href: "#/", text: "Cancel" }),
      h("button", {
        class: "btn sb-btn primary", disabled: problems.length ? "disabled" : false,
        text: form.editing ? "Save changes" : (paise > 0 ? "Add " + formatMoney(paise) : "Add expense"),
        onclick: function () { submit(); }
      })
    ])
  ]));

  /* Only the derived bits refresh while typing, so the inputs
     never lose focus or caret position mid-entry. */
  function refreshDerived() {
    var p = parseAmount(form.amount);
    var s = currentSplits();
    var prev = host.querySelector("#sb-prev");
    if (prev) { prev.innerHTML = ""; previewText(p, selectedIds(), s).forEach(function (n) { prev.appendChild(n); }); }

    var dupHost = host.querySelector("#sb-dup");
    if (dupHost) {
      dupHost.innerHTML = "";
      var d = (!form.editing && p > 0 && form.title.trim()) ? data.findDuplicate(form.title, p) : null;
      var note = dupNote(d);
      if (note) dupHost.appendChild(note);
    }

    var bad = !(p > 0) || !form.title.trim() || !selectedIds().length ||
      (form.mode === "exact" && exactSplitRemainder(p, form.exact) !== 0) ||
      p > MAX_PAISE;
    var btn = host.querySelector(".sb-savebar .primary");
    if (btn) {
      btn.disabled = !!bad;
      btn.textContent = form.editing ? "Save changes" : (p > 0 ? "Add " + formatMoney(p) : "Add expense");
    }
  }
}

function dupNote(dup) {
  if (!dup) return null;
  return h("div", { class: "sb-note" }, [
    h("span", { text: "⚠" }),
    h("span", { text: "“" + dup.title + "” for " + formatMoney(dup.amountPaise) +
      " was already added " + relTime(dup.at) + ". Saving again will double it." })
  ]);
}

function previewText(paise, ids, splits) {
  if (!(paise > 0) || !ids.length) return [document.createTextNode("Pick people and an amount.")];
  var vals = ids.map(function (id) { return splits[id] || 0; });
  var same = vals.every(function (v) { return v === vals[0]; });
  var out = [];
  if (same) {
    out.push(h("b", { text: formatMoney(vals[0]) }));
    out.push(document.createTextNode(" each · " + ids.length + " " + (ids.length === 1 ? "person" : "people")));
  } else {
    out.push(document.createTextNode(ids.map(function (id) {
      return personName(id) + " " + formatMoney(splits[id] || 0);
    }).join(" · ")));
  }
  var total = sumSplits(splits);
  if (total !== paise) {
    out.push(h("span", { style: "color:var(--sb-warn)", text: "  (" + formatMoney(paise - total) + " unassigned)" }));
  }
  return out;
}

/* The new-guest form, folded inside the visitors section, with
   an optional UPI ID so settling with them works right away. */
function newGuestForm(redraw) {
  var nameInput, upiInput;
  return h("details", { class: "sb-fold" }, [
    h("summary", { text: "＋ New guest" }),
    h("div", { class: "sb-fold-body stack" }, [
      h("div", { class: "sb-field" }, [
        h("label", { text: "Name" }),
        (nameInput = h("input", { class: "sb-input", type: "text", maxlength: "40", placeholder: "Who joined?" }))
      ]),
      h("div", { class: "sb-field" }, [
        h("label", { text: "UPI ID (optional)" }),
        (upiInput = h("input", {
          class: "sb-input", type: "text", maxlength: "64",
          placeholder: "name@okbank — lets you settle with them"
        }))
      ]),
      h("button", {
        type: "button", class: "btn sb-btn tiny", text: "Add as common visitor",
        onclick: function () {
          var name = nameInput.value.trim();
          if (!name) return toast("Give them a name", { kind: "bad" });
          data.addGuest(name, FLAT, upiInput.value.trim()).then(function (id) {
            form.chosen[id] = true;
            toast(name + " added and selected");
            redraw();
          }, function (err) {
            if (err && err.code === "duplicate") {
              form.chosen[err.person.id] = true;
              toast(err.person.name + " already exists — selected them instead");
              redraw();
            } else failed(err);
          });
        }
      })
    ])
  ]);
}

function submit() {
  var paise = parseAmount(form.amount);
  var ids = selectedIds();
  var splits = currentSplits();

  if (!(paise > 0) || !ids.length || !form.title.trim()) return;
  if (sumSplits(splits) !== paise) return toast("The split does not add up", { kind: "bad" });

  /* typo guard: a stray zero is the most expensive mistake here */
  if (paise >= 5000000 && !window.confirm("That is " + formatMoney(paise) + ". Is that right?")) return;

  prefs.catMemory[form.title.trim().toLowerCase()] = form.category;
  savePrefs();

  var payload = {
    title: form.title, note: form.note, category: form.category,
    amountPaise: paise, paidBy: form.payer, splits: splits,
    splitMode: form.mode, shares: form.mode === "shares" ? form.shares : null,
    date: form.date, flat: FLAT, by: me()
  };

  if (form.editing) {
    var e = form.editing;
    data.updateExpense(e.id, {
      title: payload.title, note: payload.note, category: payload.category,
      amountPaise: paise, paidBy: payload.paidBy, splits: splits,
      splitMode: payload.splitMode, shares: payload.shares,
      participants: Object.keys(splits), date: payload.date
    }, me(), e.updatedAt).then(function () {
      form = null;
      location.hash = "#/";
      confirmWrite("Saved");
    }, function (err) {
      if (err && err.code === "stale") {
        toast("Someone else just edited this — reopening", { kind: "bad", ms: 4000 });
        location.hash = "#/";
      } else failed(err);
    });
  } else {
    data.addExpense(payload).then(function () {
      form = null;
      location.hash = "#/";
      confirmWrite(formatMoney(paise) + " · " + payload.title);
    }, failed);
  }
}

/* ============================================================
   Screen — SETTLE
   ============================================================ */

function screenSettle(params) {
  var L = ledger();
  var from = params.from || me();
  var mine = L.transfers.filter(function (t) { return t.from === from; });
  var others = L.transfers.filter(function (t) { return t.from !== from; });

  var body = h("div", { class: "container" }, [
    banner(),
    h("div", { class: "stack" }, [
      h("section", { class: "card" }, [
        h("div", { class: "sb-head" }, [
          h("span", { class: "sb-label", text: personName(from) + " owes" }),
          mine.length > 1 ? h("button", {
            class: "sb-link", text: "Settle all",
            onclick: function () { settleAllMine(L, from); }
          }) : null
        ]),
        mine.length
          ? h("div", { class: "sb-debts" }, mine.map(function (t) { return debtRow(t, from); }))
          : h("div", { class: "sb-empty" }, [
              h("span", { class: "e-big", text: "✓" }),
              h("span", { text: personName(from) + " owes nothing." })
            ])
      ]),

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "Everyone else" }),
        others.length
          ? h("div", { class: "sb-debts", style: "margin-top:0.4rem" }, others.map(function (t) { return debtRow(t, from); }))
          : h("div", { class: "sb-empty", text: "Nothing outstanding." })
      ]),

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "Record something else" }),
        h("p", { class: "sb-meta", style: "margin:0.3rem 0 0.5rem", text: "A payment that is not in the simplified list — cash handed over, or paying someone back directly." }),
        h("button", {
          class: "btn sb-btn", text: "Custom payment",
          onclick: function () { openCustomSettle(from); }
        })
      ])
    ]),
    footer()
  ]);

  return [topbar("Settle up", "#/"), body];
}

function openCustomSettle(from) {
  var fromSel, toSel, amt;
  var all = PEOPLE.filter(function (p) { return isActive(p.id); });

  var close = sheet({
    title: "Custom payment",
    sub: "Who paid whom, and how much.",
    body: h("div", { class: "stack" }, [
      h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:0.4rem" }, [
        h("div", { class: "sb-field" }, [
          h("label", { text: "From" }),
          (fromSel = h("select", { class: "sb-select" }, all.map(function (p) {
            return h("option", { value: p.id, selected: p.id === from ? "selected" : false, text: p.name });
          })))
        ]),
        h("div", { class: "sb-field" }, [
          h("label", { text: "To" }),
          (toSel = h("select", { class: "sb-select" }, all.map(function (p) {
            return h("option", { value: p.id, text: p.name });
          })))
        ])
      ]),
      h("div", { class: "sb-field" }, [
        h("label", { text: "Amount" }),
        h("div", { class: "sb-amount" }, [
          h("span", { class: "cur", text: CURRENCY }),
          (amt = h("input", { type: "text", inputmode: "decimal", placeholder: "0", "aria-label": "Amount" }))
        ])
      ])
    ]),
    actions: [
      h("button", {
        class: "btn sb-btn primary", text: "Record",
        onclick: function () {
          var paise = parseAmount(amt.value);
          if (!(paise > 0)) return toast("Enter an amount", { kind: "bad" });
          if (paise > MAX_PAISE) return toast("Over the limit", { kind: "bad" });
          if (fromSel.value === toSel.value) return toast("Pick two different people", { kind: "bad" });
          close();
          data.addSettlement({ from: fromSel.value, to: toSel.value, amountPaise: paise, by: me(), flat: FLAT })
            .then(function () { confirmWrite("Recorded"); }, failed);
        }
      }),
      h("button", { class: "btn sb-btn", text: "Cancel", onclick: function () { close(); } })
    ]
  });
}

/* ============================================================
   Screen — ALL EXPENSES
   ============================================================ */

const allFilter = { q: "", cat: null, month: null, showDeleted: false };

function screenAll() {
  var L = ledger();
  var who = me();

  var rows = L.rows.filter(function (e) {
    if (e.deleted && !allFilter.showDeleted) return false;
    if (allFilter.cat && e.category !== allFilter.cat) return false;
    if (allFilter.month && String(e.date || "").slice(0, 7) !== allFilter.month) return false;
    if (allFilter.q) {
      var q = allFilter.q.toLowerCase();
      var hay = (e.title + " " + (e.note || "") + " " + e.participants.map(personName).join(" ") + " " + personName(e.paidBy)).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });

  var total = rows.filter(isSpend).reduce(function (s, e) { return s + e.amountPaise; }, 0);
  var months = monthsPresent(L.rows);

  var body = h("div", { class: "container" }, [
    banner(),

    h("div", { class: "sb-filters" }, [
      h("input", {
        class: "sb-input", type: "search", placeholder: "Search title, note, person…",
        value: allFilter.q,
        oninput: function (e) { allFilter.q = e.target.value; render({ keepFocus: "search" }); }
      }),
      h("button", {
        class: "btn sb-btn tiny", text: "CSV",
        onclick: function () {
          download("splitbaby-" + FLAT + "-" + data.isoDate(new Date()) + ".csv",
            data.exportCsv(rows), "text/csv");
          toast("Exported " + rows.length + " rows");
        }
      })
    ]),

    h("div", { class: "sb-chiprow", style: "margin-bottom:0.45rem" }, [
      h("button", {
        class: "sb-catbtn", "aria-pressed": !allFilter.cat && !allFilter.month ? "true" : "false",
        text: "All", onclick: function () { allFilter.cat = null; allFilter.month = null; render(); }
      })
    ].concat(months.slice(0, 6).map(function (m) {
      return h("button", {
        class: "sb-catbtn", "aria-pressed": allFilter.month === m ? "true" : "false",
        text: monthLabel(m).replace(/ \d{4}$/, ""),
        onclick: function () { allFilter.month = allFilter.month === m ? null : m; render(); }
      });
    }))),

    h("div", { class: "sb-chiprow", style: "margin-bottom:0.5rem" }, CATEGORIES.map(function (c) {
      return h("button", {
        class: "sb-catbtn", "aria-pressed": allFilter.cat === c.id ? "true" : "false",
        onclick: function () { allFilter.cat = allFilter.cat === c.id ? null : c.id; render(); }
      }, [h("span", { text: c.icon }), h("span", { text: c.label })]);
    })),

    h("section", { class: "card" }, [
      h("div", { class: "sb-head" }, [
        h("span", { class: "sb-label", text: rows.length + " of " + L.rows.length }),
        h("span", { class: "sb-meta money", text: formatMoney(total) + " total" })
      ]),
      rows.length
        ? h("div", {}, rows.slice(0, 300).map(function (e) { return expenseRow(e, who); }))
        : h("div", { class: "sb-empty" }, [
            h("span", { class: "e-big", text: "\u{1F50D}" }),
            h("span", { text: "Nothing matches those filters." })
          ])
    ]),

    h("label", { class: "sb-meta", style: "display:flex;gap:0.4rem;align-items:center;margin-top:0.5rem" }, [
      h("input", {
        type: "checkbox", checked: allFilter.showDeleted ? "checked" : false,
        onchange: function (e) { allFilter.showDeleted = e.target.checked; render(); }
      }),
      h("span", { text: "Show deleted" })
    ]),

    footer()
  ]);

  return [topbar("All expenses", "#/"), body];
}

/* ============================================================
   Screen — PERSON
   ============================================================ */

function openPerson(id) { location.hash = "#/person/" + id; }

function screenPerson(id) {
  var L = ledger();
  var p = person(id);
  if (!p) return [topbar("Unknown", "#/"), h("div", { class: "container" },
    h("div", { class: "sb-empty", text: "No such person." }))];

  var s = personSummary(L.rows, id);
  var theirs = L.rows.filter(function (e) {
    return !e.deleted && (e.participants.indexOf(id) >= 0 || e.paidBy === id);
  });
  var pairwise = L.direct.filter(function (t) { return t.from === id || t.to === id; });

  var body = h("div", { class: "container" }, [
    h("div", { class: "stack" }, [
      h("section", { class: "card" }, [
        h("div", { style: "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem" }, [
          avatar(id, "lg"),
          h("div", {}, [
            h("div", { style: "font-size:var(--sb-fs-lg);font-weight:600", text: p.name }),
            h("div", { class: "sb-meta", text: FLATS[p.flat].label + " · " + (p.kind === "member" ? "flatmate" : "guest") + (p.upi ? " · " + p.upi : "") })
          ])
        ]),

        h("div", { class: "specs" }, [
          h("div", {}, [h("dt", { text: "Net" }), h("dd", {
            class: "money", style: "color:" + (s.net > 0 ? "var(--sb-good)" : s.net < 0 ? "var(--sb-bad)" : "var(--text-dim)"),
            text: s.net === 0 ? "settled" : (s.net > 0 ? "owed " : "owes ") + formatMoney(Math.abs(s.net))
          })]),
          h("div", {}, [h("dt", { text: "Total paid" }), h("dd", { class: "money", text: formatMoney(s.totalPaid) })]),
          h("div", {}, [h("dt", { text: "Total share" }), h("dd", { class: "money", text: formatMoney(s.totalShare) })]),
          h("div", {}, [h("dt", { text: "Expenses" }), h("dd", { text: String(s.count) })])
        ]),

        p.upi && s.net < 0 ? h("div", { style: "margin-top:0.6rem" }, [
          h("span", { class: "sb-label", text: "Pay " + p.name + " " + formatMoney(-s.net) }),
          h("div", { style: "margin-top:0.35rem" }, payChooser(me(), id, -s.net))
        ]) : null
      ]),

      pairwise.length ? h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "Direct balances · before simplifying" }),
        h("div", { class: "sb-debts", style: "margin-top:0.4rem" }, pairwise.map(function (t) {
          return h("div", { class: "sb-debt" }, [
            h("span", { class: "sb-flow" }, [
              avatar(t.from), h("span", { class: "sb-nm", text: personName(t.from) }),
              h("span", { class: "sb-arrow", text: "→" }),
              avatar(t.to), h("span", { class: "sb-nm", text: personName(t.to) })
            ]),
            h("span", { class: "sb-amt money", text: formatMoney(t.amountPaise) })
          ]);
        }))
      ]) : null,

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "Their expenses" }),
        theirs.length
          ? h("div", { style: "margin-top:0.3rem" }, theirs.slice(0, 40).map(function (e) { return expenseRow(e, id); }))
          : h("div", { class: "sb-empty", text: "Nothing yet." })
      ])
    ]),
    footer()
  ]);

  return [topbar(p.name, "#/"), body];
}

/* ============================================================
   Screen — SETTINGS
   ============================================================ */

function screenSettings() {
  var L = ledger();
  var mirror = data.mirrorInfo();
  var audit = data.totalsCheck();

  var body = h("div", { class: "container" }, [
    banner(),
    h("div", { class: "stack" }, [

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "You" }),
        h("div", { class: "sb-whogrid", style: "margin-top:0.45rem" }, membersOf(FLAT).map(function (p) {
          return h("button", {
            class: "sb-who", "aria-pressed": p.id === me() ? "true" : "false",
            onclick: function () { setMe(p.id); }
          }, [avatar(p.id), h("span", { text: p.name })]);
        }))
      ]),

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "People · UPI IDs" }),
        h("div", { class: "stack", style: "gap:0.15rem;margin-top:0.4rem" }, PEOPLE.map(function (p) {
          return h("div", { class: "sb-split-row" }, [
            h("span", { class: "s-nm" }, [
              avatar(p.id, "sm"),
              h("a", { href: "#/person/" + p.id, text: p.name }),
              h("span", { class: "sb-meta", text: FLATS[p.flat].label + (p.kind === "visitor" ? " guest" : "") })
            ]),
            h("span", { class: "sb-meta", text: p.upi || "no UPI" })
          ]);
        }))
      ]),

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "Quick-add presets" }),
        h("div", { class: "sb-presets", style: "margin-top:0.4rem" },
          data.state.presets.filter(function (p) { return !p.hidden; }).map(function (p) {
            return h("span", { class: "sb-preset" }, [
              h("span", { text: category(p.category).icon + " " + p.label + " " }),
              h("span", { class: "p-amt", text: formatMoney(p.amountPaise) }),
              h("button", {
                class: "sb-link", style: "margin-left:0.3rem", text: "×",
                "aria-label": "Remove " + p.label,
                onclick: function () { data.removePreset(p.id).then(function () { toast("Removed"); }, failed); }
              })
            ]);
          })),
        h("button", {
          class: "btn sb-btn tiny", style: "margin-top:0.45rem", text: "Add a preset",
          onclick: function () { openPresetSheet(); }
        })
      ]),

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "Data" }),
        h("div", { class: "specs", style: "margin-top:0.3rem" }, [
          h("div", {}, [h("dt", { text: "Mode" }), h("dd", { text: data.state.mode === "live" ? "Firebase · " + data.state.sync : "Demo (this device only)" })]),
          h("div", {}, [h("dt", { text: "Expenses" }), h("dd", { text: String(live(L.rows).length) })]),
          h("div", {}, [h("dt", { text: "Ledger check" }), h("dd", {
            style: "color:" + (audit === 0 ? "var(--sb-good)" : "var(--sb-bad)"),
            text: audit === 0 ? "balanced" : "off by " + formatMoney(audit)
          })]),
          h("div", {}, [h("dt", { text: "Device backup" }), h("dd", {
            text: mirror ? mirror.count + " expenses · " + relTime(mirror.savedAt) : "none yet"
          })])
        ]),
        h("div", { class: "sb-detail-acts" }, [
          h("button", {
            class: "btn sb-btn tiny", text: "Export CSV",
            onclick: function () {
              download("splitbaby-" + FLAT + "-" + data.isoDate(new Date()) + ".csv", data.exportCsv(), "text/csv");
            }
          }),
          mirror && data.state.mode === "live" ? h("button", {
            class: "btn sb-btn tiny", text: "Restore from this device",
            onclick: function () {
              if (!window.confirm("Push the " + mirror.count + " expenses stored on this device back to the ledger? Existing ones are left alone.")) return;
              data.restoreFromMirror().then(function (n) {
                toast(n ? "Restored " + n + " expenses" : "Nothing was missing");
              }, failed);
            }
          }) : null
        ])
      ]),

      h("section", { class: "card" }, [
        h("span", { class: "sb-label", text: "The other flat" }),
        h("p", { class: "sb-meta", style: "margin:0.3rem 0 0.45rem", text: "Same ledger, seen from " + FLATS[AWAY].label + ". Balances that cross flats appear on both." }),
        h("a", { class: "btn sb-btn tiny", href: "../" + AWAY + "splitbaby/", text: "Open " + FLATS[AWAY].label + " splitbaby" })
      ])
    ]),
    footer()
  ]);

  return [topbar("Settings", "#/"), body];
}

function openPresetSheet() {
  var label, amount, cat = DEFAULT_CATEGORY;
  var close = sheet({
    title: "New preset",
    sub: "A one-tap shortcut for something you buy often.",
    body: h("div", { class: "stack" }, [
      h("div", { class: "sb-field" }, [
        h("label", { text: "Label" }),
        (label = h("input", { class: "sb-input", type: "text", maxlength: "40", placeholder: "Water can" }))
      ]),
      h("div", { class: "sb-field" }, [
        h("label", { text: "Amount" }),
        (amount = h("input", { class: "sb-input", type: "text", inputmode: "decimal", placeholder: "60" }))
      ]),
      h("div", { class: "sb-field" }, [
        h("label", { text: "Category" }),
        h("select", { class: "sb-select", onchange: function (e) { cat = e.target.value; } },
          CATEGORIES.map(function (c) { return h("option", { value: c.id, text: c.icon + " " + c.label }); }))
      ])
    ]),
    actions: [
      h("button", {
        class: "btn sb-btn primary", text: "Save",
        onclick: function () {
          var paise = parseAmount(amount.value);
          if (!label.value.trim()) return toast("Give it a label", { kind: "bad" });
          if (!(paise > 0)) return toast("Give it an amount", { kind: "bad" });
          close();
          data.addPreset(label.value, paise, cat).then(function () { toast("Preset saved"); }, failed);
        }
      }),
      h("button", { class: "btn sb-btn", text: "Cancel", onclick: function () { close(); } })
    ]
  });
}

/* ============================================================
   Router
   ============================================================ */

function parseHash() {
  var raw = location.hash.replace(/^#\/?/, "");
  var parts = raw.split("?");
  var path = parts[0] || "";
  var params = {};
  (parts[1] || "").split("&").forEach(function (kv) {
    if (!kv) return;
    var p = kv.split("=");
    params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
  });
  return { path: path, params: params };
}

let lastPath = null;

function render(opts) {
  var o = opts || {};
  var r = parseHash();
  var seg = r.path.split("/");

  /* the add form owns its own DOM while mounted, so a background
     sync cannot wipe what is half-typed */
  if (seg[0] === "add" && form && form.dirty && lastPath === r.path && o.fromData) return;

  var focusSel = o.keepFocus === "search" ? 'input[type="search"]' : null;
  var caret = null;
  if (focusSel) {
    var cur = root.querySelector(focusSel);
    if (cur) caret = cur.selectionStart;
  }

  postMount = [];

  var view;
  if (!data.state.ready && !data.state.expenses.length) {
    view = [topbar(null, null), h("div", { class: "container" }, [banner(), skeleton()])];
  } else if (seg[0] === "add") {
    view = screenAdd(r.params);
  } else if (seg[0] === "settle") {
    view = screenSettle(r.params);
  } else if (seg[0] === "all") {
    view = screenAll();
  } else if (seg[0] === "person" && seg[1]) {
    view = screenPerson(seg[1]);
  } else if (seg[0] === "expense" && seg[1]) {
    view = screenAdd({ edit: seg[1] });
  } else if (seg[0] === "settings") {
    view = screenSettings();
  } else {
    view = screenHome();
  }

  if (seg[0] !== "add" && seg[0] !== "expense") form = null;
  lastPath = r.path;

  root.innerHTML = "";
  view.forEach(function (n) { if (n) root.appendChild(n); });

  var queued = postMount;
  postMount = [];
  queued.forEach(function (fn) {
    try { fn(); } catch (err) { console.error("[splitbaby] mount step failed", err); }
  });

  if (focusSel) {
    var next = root.querySelector(focusSel);
    if (next) { next.focus(); if (caret != null) try { next.setSelectionRange(caret, caret); } catch (e) {} }
  }
}

window.addEventListener("hashchange", function () {
  openExpense = null;
  expandedGroup = null;
  render();
});

let resizeTimer = null;
window.addEventListener("resize", function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    var r = parseHash();
    if ((r.path || "") === "") render();
  }, 180);
});

/* ------------------------------------------------------------
   Live updates from other devices
   ------------------------------------------------------------ */

let knownIds = null;

data.onChange(function (s) {
  if (knownIds !== null && s.mode === "live") {
    var fresh = s.expenses.filter(function (e) {
      return !knownIds[e.id] && !e.deleted && e.createdBy !== me() && (Date.now() - e.at) < 120000;
    });
    if (fresh.length === 1) {
      toast(personName(fresh[0].createdBy) + " added " + fresh[0].title + " " + formatMoney(fresh[0].amountPaise));
    } else if (fresh.length > 1) {
      toast(fresh.length + " new expenses synced");
    }
  }
  knownIds = {};
  s.expenses.forEach(function (e) { knownIds[e.id] = true; });

  render({ fromData: true });
});

/* ------------------------------------------------------------
   Go
   ------------------------------------------------------------ */

document.body.classList.add("sb");
render();
data.start(FLAT);
