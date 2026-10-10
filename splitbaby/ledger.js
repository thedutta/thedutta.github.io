/* ============================================================
   Splitbaby — ledger math

   Every amount in this file is an INTEGER NUMBER OF PAISE.
   Floats drift, and a ledger whose balances do not sum to
   exactly zero is a bug you chase forever. Rupees exist only
   at the edges: parseAmount() on the way in, formatMoney() on
   the way out.

   Pure functions, no DOM, no Firestore — exercised by test.html.
   ============================================================ */

import { CURRENCY, LOCALE, FLATS, person, personName, membersOf, guestsOf, otherFlat } from "./config.js";

export const MAX_PAISE = 10000000;          /* Rs 1,00,000 — sanity ceiling */

/* ------------------------------------------------------------
   Money in and out
   ------------------------------------------------------------ */

/* "Rs 1,840.50" | "1840.5" | "1840" -> 184050. NaN on junk. */
export function parseAmount(input) {
  var s = String(input == null ? "" : input).replace(/[\s,₹]/g, "");
  if (!s || s === ".") return NaN;
  if (!/^\d*\.?\d*$/.test(s)) return NaN;
  var parts = s.split(".");
  var rupees = parts[0] === "" ? 0 : parseInt(parts[0], 10);
  var frac = (parts[1] || "").slice(0, 2);
  while (frac.length < 2) frac += "0";
  var paise = rupees * 100 + parseInt(frac, 10);
  return Number.isFinite(paise) ? paise : NaN;
}

/* 184050 -> "Rs1,840.50"; 184000 -> "Rs1,840". Paise are hidden
   when they are .00, which stops dense money columns from
   filling up with visual noise. */
export function formatMoney(paise, opts) {
  var o = opts || {};
  var n = Math.round(Number(paise) || 0);
  var abs = Math.abs(n);
  var hasPaise = abs % 100 !== 0;
  var body = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0
  }).format(abs / 100);
  var sign = n < 0 ? "−" : (o.plus && n > 0 ? "+" : "");
  return sign + (o.bare ? "" : CURRENCY) + body;
}

/* For prefilling an <input> when repeating or editing. */
export function paiseToInput(paise) {
  var n = Math.round(Number(paise) || 0);
  return (n % 100 === 0) ? String(n / 100) : (n / 100).toFixed(2);
}

/* ------------------------------------------------------------
   Splitting — all three modes return a map summing to EXACTLY
   amountPaise, with leftover paise placed deterministically so
   the same input gives the same split on every device.
   ------------------------------------------------------------ */

function uniq(list) {
  var seen = Object.create(null), out = [];
  (list || []).forEach(function (id) {
    if (id && !seen[id]) { seen[id] = 1; out.push(id); }
  });
  return out;
}

/* Payer first, then alphabetical: the payer absorbs odd paise. */
function splitOrder(participants, payer) {
  var ids = uniq(participants);
  var others = ids.filter(function (id) { return id !== payer; }).sort();
  return ids.indexOf(payer) >= 0 ? [payer].concat(others) : others;
}

export function equalSplit(amountPaise, participants, payer) {
  var order = splitOrder(participants, payer);
  var out = {};
  var n = order.length;
  if (!n) return out;
  var base = Math.floor(amountPaise / n);
  var rem = amountPaise - base * n;
  for (var i = 0; i < n; i++) out[order[i]] = base + (i < rem ? 1 : 0);
  return out;
}

/* shares: { id: weight }. Largest-remainder apportionment. */
export function sharesSplit(amountPaise, shares, payer) {
  var src = shares || {};
  var ids = Object.keys(src).filter(function (id) { return Number(src[id]) > 0; });
  var total = ids.reduce(function (s, id) { return s + Number(src[id]); }, 0);
  var out = {};
  if (!ids.length || !(total > 0)) return out;

  var rows = ids.map(function (id) {
    var exact = amountPaise * Number(src[id]) / total;
    return { id: id, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  var assigned = 0;
  rows.forEach(function (r) { out[r.id] = r.floor; assigned += r.floor; });

  var rem = amountPaise - assigned;
  rows.sort(function (a, b) {
    if (b.frac !== a.frac) return b.frac - a.frac;
    if (a.id === payer) return -1;
    if (b.id === payer) return 1;
    return a.id.localeCompare(b.id);
  });
  for (var i = 0; i < rows.length && rem > 0; i++) { out[rows[i].id] += 1; rem--; }
  return out;
}

/* How much of the total is still unassigned in "exact" mode.
   The save button stays disabled until this is exactly 0. */
export function exactSplitRemainder(amountPaise, exact) {
  var src = exact || {};
  var sum = 0;
  Object.keys(src).forEach(function (id) { sum += Math.round(Number(src[id]) || 0); });
  return amountPaise - sum;
}

export function buildSplits(mode, amountPaise, participants, payer, extra) {
  var ex = extra || {};
  if (mode === "exact") {
    var out = {};
    uniq(participants).forEach(function (id) { out[id] = Math.round(Number(ex[id]) || 0); });
    return out;
  }
  if (mode === "shares") {
    var weights = {};
    uniq(participants).forEach(function (id) {
      var w = Number(ex[id]);
      weights[id] = w > 0 ? w : 0;
    });
    return sharesSplit(amountPaise, weights, payer);
  }
  return equalSplit(amountPaise, participants, payer);
}

export function sumSplits(splits) {
  var src = splits || {};
  var t = 0;
  Object.keys(src).forEach(function (id) { t += Math.round(Number(src[id]) || 0); });
  return t;
}

/* ------------------------------------------------------------
   Balances

   One formula covers expenses AND all four settlement flows,
   because a settlement is just an expense whose splits map is
   { payee: amount }: the payer put money in, the payee took it
   out, which is exactly what a debt moving looks like.
   ------------------------------------------------------------ */

export function live(expenses) {
  return (expenses || []).filter(function (e) { return e && !e.deleted; });
}

function bump(map, id, delta) {
  if (!id) return;
  map[id] = (map[id] || 0) + delta;
}

export function netBalances(expenses) {
  var bal = {};
  live(expenses).forEach(function (e) {
    bump(bal, e.paidBy, Math.round(Number(e.amountPaise) || 0));
    var splits = e.splits || {};
    Object.keys(splits).forEach(function (id) {
      bump(bal, id, -Math.round(Number(splits[id]) || 0));
    });
  });
  return bal;
}

/* Greedy largest-debtor against largest-creditor. Every step
   zeroes at least one party, so this emits at most n-1
   transfers — the shape Splitwise calls "simplify debts". */
export function simplify(balances) {
  var src = balances || {};
  var debtors = [], creditors = [];
  Object.keys(src).forEach(function (id) {
    var v = Math.round(src[id] || 0);
    if (v < 0) debtors.push({ id: id, amt: -v });
    else if (v > 0) creditors.push({ id: id, amt: v });
  });

  function order(a, b) { return b.amt - a.amt || a.id.localeCompare(b.id); }
  debtors.sort(order);
  creditors.sort(order);

  var out = [], i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    var d = debtors[i], c = creditors[j];
    var amt = Math.min(d.amt, c.amt);
    if (amt > 0) out.push({ from: d.id, to: c.id, amountPaise: amt });
    d.amt -= amt; c.amt -= amt;
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }
  return out;
}

/* Un-simplified, pairwise: "you owe Zaid Rs240 directly". */
export function directBalances(expenses) {
  var pair = {};
  function key(a, b) { return a + "\u0000" + b; }

  live(expenses).forEach(function (e) {
    var splits = e.splits || {};
    Object.keys(splits).forEach(function (id) {
      if (id === e.paidBy) return;
      var amt = Math.round(Number(splits[id]) || 0);
      if (!amt) return;
      var k = key(id, e.paidBy);
      pair[k] = (pair[k] || 0) + amt;
    });
  });

  var out = [], done = {};
  Object.keys(pair).forEach(function (k) {
    if (done[k]) return;
    var parts = k.split("\u0000"), a = parts[0], b = parts[1];
    var rk = key(b, a);
    done[k] = 1; done[rk] = 1;
    var net = (pair[k] || 0) - (pair[rk] || 0);
    if (net > 0) out.push({ from: a, to: b, amountPaise: net });
    else if (net < 0) out.push({ from: b, to: a, amountPaise: -net });
  });
  return out.sort(function (x, y) { return y.amountPaise - x.amountPaise; });
}

/* ------------------------------------------------------------
   Summaries
   ------------------------------------------------------------ */

export function isSpend(e) { return !!e && e.kind !== "settlement"; }

export function personSummary(expenses, id) {
  var rows = live(expenses);
  var paid = 0, share = 0, count = 0;
  rows.forEach(function (e) {
    if (!isSpend(e)) return;
    if (e.paidBy === id) paid += Math.round(Number(e.amountPaise) || 0);
    var s = Math.round(Number((e.splits || {})[id]) || 0);
    if (s) { share += s; count++; }
  });
  var bal = netBalances(rows);
  return {
    id: id,
    totalPaid: paid,
    totalShare: share,
    net: Math.round(bal[id] || 0),
    count: count
  };
}

export function monthKeyOf(e) {
  return String((e && e.date) || "").slice(0, 7);
}

export function monthsPresent(expenses) {
  var set = {};
  live(expenses).forEach(function (e) {
    var k = monthKeyOf(e);
    if (k) set[k] = 1;
  });
  return Object.keys(set).sort().reverse();
}

/* month: "2026-10" or null for all time. flat: restrict the
   headline total to expenses entered from one flat. */
export function monthStats(expenses, month, flat) {
  var rows = live(expenses).filter(function (e) {
    if (!isSpend(e)) return false;
    return !month || monthKeyOf(e) === month;
  });

  var total = 0, count = 0, paidBy = {}, shareBy = {}, byCategory = {};
  rows.forEach(function (e) {
    var amt = Math.round(Number(e.amountPaise) || 0);
    if (!flat || e.flat === flat) { total += amt; count++; }
    paidBy[e.paidBy] = (paidBy[e.paidBy] || 0) + amt;
    var cat = e.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + amt;
    var splits = e.splits || {};
    Object.keys(splits).forEach(function (id) {
      shareBy[id] = (shareBy[id] || 0) + Math.round(Number(splits[id]) || 0);
    });
  });

  return {
    month: month, total: total, count: count,
    paidBy: paidBy, shareBy: shareBy, byCategory: byCategory
  };
}

/* Newest write anywhere in the ledger — drives the "updated"
   stamp on the balances card. */
export function lastActivity(expenses) {
  var best = 0;
  live(expenses).forEach(function (e) {
    var t = Number(e.updatedAt || e.at || e.createdAt || 0);
    if (t > best) best = t;
  });
  return best || 0;
}

/* ------------------------------------------------------------
   Graph grouping

   Tier 1 is always this flat's members, individually. Tier 2
   holds the guests AND the whole other flat as one entity, at
   equal priority — auto-compacting into "Other guests" when
   the screen cannot fit them all. The simplified list below
   the graph always expands these groups into individuals.
   ------------------------------------------------------------ */

function nodeFor(id, net) {
  return {
    id: id, kind: "person", label: personName(id),
    sub: "", net: Math.round(net || 0), members: [id]
  };
}

function groupNode(id, label, sub, members, balances) {
  var net = 0;
  members.forEach(function (m) { net += Math.round(balances[m] || 0); });
  return { id: id, kind: "group", label: label, sub: sub, net: net, members: members.slice() };
}

export function collapseGroups(balances, opts) {
  var o = opts || {};
  var home = o.homeFlat || "b002";
  var away = otherFlat(home);
  var budget = Math.max(2, Math.min(5, o.guestBudget || 4));
  var bal = balances || {};

  var tier1 = membersOf(home).map(function (p) { return nodeFor(p.id, bal[p.id]); });

  /* the other flat is ALWAYS one entity */
  var awayIds = [];
  membersOf(away).concat(guestsOf(away)).forEach(function (p) { awayIds.push(p.id); });
  Object.keys(bal).forEach(function (id) {
    var p = person(id);
    if (p && p.flat === away && awayIds.indexOf(id) < 0) awayIds.push(id);
  });

  var tier2 = [];
  var awayActive = awayIds.some(function (id) { return Math.round(bal[id] || 0) !== 0; });
  if (awayActive) {
    tier2.push(groupNode("@" + away, FLATS[away].label, awayIds.length + " people", awayIds, bal));
  }

  /* home-flat guests, busiest first; settled ones take no slot */
  var guests = guestsOf(home)
    .map(function (p) { return { id: p.id, net: Math.round(bal[p.id] || 0) }; })
    .filter(function (g) { return g.net !== 0; })
    .sort(function (a, b) {
      return Math.abs(b.net) - Math.abs(a.net) || a.id.localeCompare(b.id);
    });

  var slots = budget - tier2.length;
  if (guests.length <= slots) {
    guests.forEach(function (g) { tier2.push(nodeFor(g.id, g.net)); });
  } else if (slots >= 2) {
    guests.slice(0, slots - 1).forEach(function (g) { tier2.push(nodeFor(g.id, g.net)); });
    var rest = guests.slice(slots - 1).map(function (g) { return g.id; });
    tier2.push(groupNode("@guests", "Other guests", rest.length + " people", rest, bal));
  } else if (guests.length) {
    var all = guests.map(function (g) { return g.id; });
    tier2.push(groupNode("@guests", "Other guests", all.length + " people", all, bal));
  }

  return { tier1: tier1, tier2: tier2 };
}

/* Which individual ids a node stands for — used to expand a
   tapped group into its rows in the simplified list. */
export function membersOfNode(nodes, nodeId) {
  var all = (nodes.tier1 || []).concat(nodes.tier2 || []);
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === nodeId) return all[i].members.slice();
  }
  return [];
}
