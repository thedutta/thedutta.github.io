/* ============================================================
   Splitbaby — ledger assertions

   One suite, two runners: test.html renders it in the browser,
   and it can be imported by node. Covers the invariants the
   whole app leans on, above all that balances always sum to
   exactly zero.
   ============================================================ */

import {
  parseAmount, formatMoney, equalSplit, sharesSplit, buildSplits,
  sumSplits, exactSplitRemainder, netBalances, simplify, directBalances,
  personSummary, monthStats, collapseGroups, membersOfNode, MAX_PAISE
} from "./ledger.js";

import { registerPerson } from "./config.js";

/* ---- tiny harness ------------------------------------------- */

var suite = [];
function test(name, fn) { suite.push({ name: name, fn: fn }); }
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || "not equal") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b));
}
function eqMap(a, b, msg) {
  var ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  eq(ka.join(","), kb.join(","), (msg || "") + " keys");
  ka.forEach(function (k) { eq(a[k], b[k], (msg || "") + " [" + k + "]"); });
}
function sumValues(m) {
  return Object.keys(m).reduce(function (s, k) { return s + m[k]; }, 0);
}

/* ---- fixtures ----------------------------------------------- */

var B002 = ["atharv", "dutta", "nikhil", "zaid"];

function expense(over) {
  var base = {
    kind: "expense", title: "x", category: "groceries",
    amountPaise: 40000, paidBy: "dutta", flat: "b002",
    date: "2026-10-10", at: 1000, deleted: false
  };
  var e = Object.assign({}, base, over || {});
  if (!e.splits) e.splits = equalSplit(e.amountPaise, e.participants || B002, e.paidBy);
  if (!e.participants) e.participants = Object.keys(e.splits);
  return e;
}

function settlement(from, to, paise, over) {
  var e = {
    kind: "settlement", title: "Settle", category: null,
    amountPaise: paise, paidBy: from, splits: {}, participants: [from, to],
    flat: "b002", date: "2026-10-11", at: 2000, deleted: false
  };
  e.splits[to] = paise;
  return Object.assign(e, over || {});
}

/* ============================================================
   Money parsing and formatting
   ============================================================ */

test("parseAmount handles rupees, paise, commas, currency sign", function () {
  eq(parseAmount("840"), 84000);
  eq(parseAmount("840.5"), 84050);
  eq(parseAmount("840.50"), 84050);
  eq(parseAmount("1,840.75"), 184075);
  eq(parseAmount("₹ 1840"), 184000);
  eq(parseAmount(".5"), 50);
  eq(parseAmount("0.01"), 1);
});

test("parseAmount rejects junk instead of guessing", function () {
  ok(Number.isNaN(parseAmount("")), "empty");
  ok(Number.isNaN(parseAmount("abc")), "letters");
  ok(Number.isNaN(parseAmount("1.2.3")), "two dots");
  ok(Number.isNaN(parseAmount("-5")), "negative");
  ok(Number.isNaN(parseAmount(".")), "lone dot");
});

test("parseAmount truncates beyond paise rather than rounding up", function () {
  eq(parseAmount("10.999"), 1099);
});

test("formatMoney hides .00 but keeps real paise", function () {
  eq(formatMoney(184000, { bare: true }), "1,840");
  eq(formatMoney(184050, { bare: true }), "1,840.50");
  eq(formatMoney(-42000, { bare: true }), "−420");
  eq(formatMoney(0, { bare: true }), "0");
});

/* ============================================================
   Splitting — the sum must always be exact
   ============================================================ */

test("equalSplit divides evenly when it can", function () {
  eqMap(equalSplit(40000, B002, "dutta"),
    { atharv: 10000, dutta: 10000, nikhil: 10000, zaid: 10000 });
});

test("equalSplit remainder lands on the payer", function () {
  var s = equalSplit(10000, ["dutta", "zaid", "nikhil"], "dutta");
  eq(sumSplits(s), 10000, "sums exactly");
  eq(s.dutta, 3334, "payer absorbs the odd paisa");
  eq(s.nikhil, 3333);
  eq(s.zaid, 3333);
});

test("equalSplit is deterministic regardless of input order", function () {
  var a = equalSplit(10000, ["zaid", "nikhil", "dutta"], "dutta");
  var b = equalSplit(10000, ["dutta", "nikhil", "zaid"], "dutta");
  eqMap(a, b);
});

test("equalSplit handles a payer who is not a participant", function () {
  var s = equalSplit(9999, ["zaid", "nikhil"], "dutta");
  eq(sumSplits(s), 9999);
  ok(!("dutta" in s), "payer takes no share");
});

test("equalSplit dedupes a repeated participant", function () {
  var s = equalSplit(30000, ["dutta", "dutta", "zaid"], "dutta");
  eq(Object.keys(s).length, 2);
  eq(sumSplits(s), 30000);
});

test("equalSplit on an empty participant list is empty, not a crash", function () {
  eqMap(equalSplit(40000, [], "dutta"), {});
});

test("sharesSplit apportions by weight and still sums exactly", function () {
  var s = sharesSplit(10000, { dutta: 2, zaid: 1 }, "dutta");
  eq(sumSplits(s), 10000);
  eq(s.dutta, 6667);
  eq(s.zaid, 3333);
});

test("sharesSplit ignores zero and negative weights", function () {
  var s = sharesSplit(30000, { dutta: 1, zaid: 0, nikhil: -4 }, "dutta");
  eqMap(s, { dutta: 30000 });
});

test("sharesSplit with no positive weight returns empty", function () {
  eqMap(sharesSplit(30000, { dutta: 0 }, "dutta"), {});
});

test("buildSplits exact mode passes typed paise through", function () {
  var s = buildSplits("exact", 30000, ["dutta", "zaid"], "dutta", { dutta: 20000, zaid: 10000 });
  eqMap(s, { dutta: 20000, zaid: 10000 });
  eq(exactSplitRemainder(30000, s), 0);
});

test("exactSplitRemainder reports the shortfall the save button blocks on", function () {
  eq(exactSplitRemainder(30000, { dutta: 20000 }), 10000);
  eq(exactSplitRemainder(30000, { dutta: 40000 }), -10000);
});

test("every split mode sums to the total across many odd amounts", function () {
  for (var amt = 1; amt < 3000; amt += 7) {
    for (var n = 1; n <= 5; n++) {
      var ids = B002.concat(["jap"]).slice(0, n);
      eq(sumSplits(equalSplit(amt, ids, "dutta")), amt, "equal " + amt + "/" + n);
      var w = {};
      ids.forEach(function (id, i) { w[id] = i + 1; });
      eq(sumSplits(sharesSplit(amt, w, "dutta")), amt, "shares " + amt + "/" + n);
    }
  }
});

/* ============================================================
   Balances
   ============================================================ */

test("netBalances always sums to exactly zero", function () {
  var rows = [
    expense({ amountPaise: 84000 }),
    expense({ amountPaise: 10000, paidBy: "zaid", participants: ["dutta", "zaid", "nikhil"] }),
    expense({ amountPaise: 55555, paidBy: "nikhil", participants: B002.concat(["jap", "aryan"]) }),
    settlement("atharv", "dutta", 12345)
  ];
  eq(sumValues(netBalances(rows)), 0);
});

test("netBalances: payer is up by what others owe", function () {
  var bal = netBalances([expense({ amountPaise: 40000 })]);
  eq(bal.dutta, 30000, "paid 400, owes own 100");
  eq(bal.zaid, -10000);
});

test("netBalances ignores soft-deleted rows", function () {
  var bal = netBalances([expense({ amountPaise: 40000, deleted: true })]);
  eq(sumValues(bal), 0);
  eq(bal.dutta || 0, 0);
});

test("an expense paid purely for others credits the payer fully", function () {
  var bal = netBalances([expense({ amountPaise: 30000, paidBy: "dutta", participants: ["zaid", "nikhil", "atharv"] })]);
  eq(bal.dutta, 30000);
  eq(bal.zaid, -10000);
});

test("a solo expense by the payer nets to zero", function () {
  var bal = netBalances([expense({ amountPaise: 40000, participants: ["dutta"] })]);
  eq(bal.dutta, 0);
});

/* ============================================================
   The four settlement flows
   ============================================================ */

test("settle up clears exactly the debt it pays", function () {
  var spend = expense({ amountPaise: 40000 });              /* zaid owes dutta 100 */
  var before = netBalances([spend]);
  eq(before.zaid, -10000);
  var after = netBalances([spend, settlement("zaid", "dutta", 10000)]);
  eq(after.zaid, 0, "zaid is square");
  eq(after.dutta, 20000, "dutta still owed by the other two");
  eq(sumValues(after), 0);
});

test("mark paid is the same mechanism recorded by someone else", function () {
  var spend = expense({ amountPaise: 40000, participants: B002.concat(["jap"]) });
  var owed = -netBalances([spend]).jap;
  var after = netBalances([spend, settlement("jap", "dutta", owed, { createdBy: "dutta" })]);
  eq(after.jap, 0, "the guest is square");
  eq(sumValues(after), 0);
});

test("cover moves a guest debt onto the covering member", function () {
  var spend = expense({ amountPaise: 50000, participants: B002.concat(["jap"]) });
  var before = netBalances([spend]);
  var japOwes = -before.jap;
  ok(japOwes > 0, "jap owes something");

  /* a cover is a settlement from the guest to the member who
     fronts it: the guest clears, the member picks it up */
  var cover = settlement("jap", "nikhil", japOwes, { kind: "settlement", coverFor: "jap" });
  var after = netBalances([spend, cover]);

  eq(after.jap, 0, "guest cleared");
  eq(after.nikhil, before.nikhil - japOwes, "covering member now carries it");
  eq(after.dutta, before.dutta, "the creditor is untouched");
  eq(sumValues(after), 0);
});

test("settle all mine zeroes one person across several creditors", function () {
  var rows = [
    expense({ amountPaise: 40000, paidBy: "dutta" }),
    expense({ amountPaise: 40000, paidBy: "nikhil" })
  ];
  var transfers = simplify(netBalances(rows)).filter(function (t) { return t.from === "zaid"; });
  ok(transfers.length > 0, "zaid owes someone");
  var settled = rows.concat(transfers.map(function (t) {
    return settlement(t.from, t.to, t.amountPaise);
  }));
  eq(netBalances(settled).zaid, 0);
  eq(sumValues(netBalances(settled)), 0);
});

test("a full round of simplified settlements clears the whole ledger", function () {
  var rows = [
    expense({ amountPaise: 84000, paidBy: "dutta" }),
    expense({ amountPaise: 31000, paidBy: "zaid", participants: ["zaid", "nikhil"] }),
    expense({ amountPaise: 55555, paidBy: "nikhil", participants: B002.concat(["jap", "aryan"]) })
  ];
  var all = rows.concat(simplify(netBalances(rows)).map(function (t) {
    return settlement(t.from, t.to, t.amountPaise);
  }));
  var after = netBalances(all);
  Object.keys(after).forEach(function (id) { eq(after[id], 0, "settled " + id); });
});

/* ============================================================
   Simplify
   ============================================================ */

test("simplify reproduces the same net balances", function () {
  var bal = netBalances([
    expense({ amountPaise: 84000 }),
    expense({ amountPaise: 31000, paidBy: "zaid", participants: ["zaid", "nikhil", "jap"] })
  ]);
  var replay = {};
  simplify(bal).forEach(function (t) {
    replay[t.from] = (replay[t.from] || 0) - t.amountPaise;
    replay[t.to] = (replay[t.to] || 0) + t.amountPaise;
  });
  Object.keys(bal).forEach(function (id) {
    if (bal[id] !== 0) eq(replay[id] || 0, bal[id], "replay " + id);
  });
});

test("simplify emits at most n-1 transfers", function () {
  var bal = netBalances([
    expense({ amountPaise: 84000 }),
    expense({ amountPaise: 31000, paidBy: "zaid" }),
    expense({ amountPaise: 55555, paidBy: "nikhil", participants: B002.concat(["jap", "aryan"]) }),
    expense({ amountPaise: 12000, paidBy: "aryan", participants: ["aryan", "dutta"] })
  ]);
  var n = Object.keys(bal).filter(function (id) { return bal[id] !== 0; }).length;
  ok(simplify(bal).length <= Math.max(0, n - 1), "transfers <= n-1");
});

test("simplify of a settled ledger is empty", function () {
  eq(simplify({ dutta: 0, zaid: 0 }).length, 0);
  eq(simplify({}).length, 0);
});

test("simplify never emits a self-transfer", function () {
  simplify(netBalances([expense({ amountPaise: 99999, participants: B002.concat(["jap"]) })]))
    .forEach(function (t) { ok(t.from !== t.to, "no self transfer"); });
});

test("simplify is deterministic", function () {
  var bal = { dutta: 30000, zaid: -10000, nikhil: -10000, atharv: -10000 };
  eq(JSON.stringify(simplify(bal)), JSON.stringify(simplify(bal)));
});

/* ============================================================
   Direct balances
   ============================================================ */

test("directBalances nets opposite debts between two people", function () {
  var rows = [
    expense({ amountPaise: 20000, paidBy: "dutta", participants: ["dutta", "zaid"] }),
    expense({ amountPaise: 6000, paidBy: "zaid", participants: ["dutta", "zaid"] })
  ];
  var d = directBalances(rows);
  eq(d.length, 1);
  eq(d[0].from, "zaid");
  eq(d[0].to, "dutta");
  eq(d[0].amountPaise, 7000, "10000 owed minus 3000 back");
});

test("directBalances drops a pair that cancels out", function () {
  var rows = [
    expense({ amountPaise: 20000, paidBy: "dutta", participants: ["dutta", "zaid"] }),
    expense({ amountPaise: 20000, paidBy: "zaid", participants: ["dutta", "zaid"] })
  ];
  eq(directBalances(rows).length, 0);
});

/* ============================================================
   Summaries
   ============================================================ */

test("personSummary separates what you paid from what you owe", function () {
  var rows = [
    expense({ amountPaise: 40000, paidBy: "dutta" }),
    expense({ amountPaise: 20000, paidBy: "zaid", participants: ["dutta", "zaid"] })
  ];
  var s = personSummary(rows, "dutta");
  eq(s.totalPaid, 40000);
  eq(s.totalShare, 20000, "100 of the first + 100 of the second");
  eq(s.net, 20000);
  eq(s.count, 2);
});

test("personSummary excludes settlements from spending totals", function () {
  var rows = [expense({ amountPaise: 40000 }), settlement("zaid", "dutta", 10000)];
  eq(personSummary(rows, "zaid").totalPaid, 0, "a settlement is not spending");
  eq(personSummary(rows, "zaid").net, 0, "but it does clear the balance");
});

test("monthStats totals only the asked-for month", function () {
  var rows = [
    expense({ amountPaise: 40000, date: "2026-10-02" }),
    expense({ amountPaise: 10000, date: "2026-09-28" })
  ];
  eq(monthStats(rows, "2026-10", "b002").total, 40000);
  eq(monthStats(rows, "2026-09", "b002").total, 10000);
  eq(monthStats(rows, null, "b002").total, 50000, "null month means all time");
  eq(monthStats(rows, "2026-10", "b002").count, 1);
});

test("monthStats headline total respects the flat filter", function () {
  var rows = [
    expense({ amountPaise: 40000, flat: "b002" }),
    expense({ amountPaise: 10000, flat: "b603" })
  ];
  eq(monthStats(rows, null, "b002").total, 40000);
  eq(monthStats(rows, null, "b603").total, 10000);
  eq(monthStats(rows, null, null).total, 50000);
});

test("monthStats ignores settlements and deleted rows", function () {
  var rows = [
    expense({ amountPaise: 40000 }),
    settlement("zaid", "dutta", 10000),
    expense({ amountPaise: 90000, deleted: true })
  ];
  eq(monthStats(rows, null, "b002").total, 40000);
});

/* ============================================================
   Graph grouping and compaction
   ============================================================ */

test("tier 1 is always this flat's four members, even when settled", function () {
  var g = collapseGroups({}, { homeFlat: "b002", guestBudget: 4 });
  eq(g.tier1.length, 4);
  eq(g.tier1.map(function (n) { return n.id; }).join(","), "atharv,dutta,nikhil,zaid",
    "alphabetical");
  eq(g.tier2.length, 0, "a quiet ledger shows no tier 2 noise");
});

test("the other flat is a single node whose net is its members' sum", function () {
  var bal = { dutta: 23000, aryan: -15000, kunsh: -8000 };
  var g = collapseGroups(bal, { homeFlat: "b002", guestBudget: 4 });
  var away = g.tier2.filter(function (n) { return n.id === "@b603"; })[0];
  ok(away, "b603 node exists");
  eq(away.kind, "group");
  eq(away.label, "B603");
  eq(away.net, -23000, "aggregate equals the sum of its individuals");
  ok(away.members.indexOf("aryan") >= 0 && away.members.indexOf("dipen") >= 0,
    "covers b603 members and guests");
});

test("settled guests take no slot in tier 2", function () {
  var g = collapseGroups({ dutta: 9000, jap: -9000, vagmi: 0 }, { homeFlat: "b002", guestBudget: 4 });
  var ids = g.tier2.map(function (n) { return n.id; });
  ok(ids.indexOf("jap") >= 0, "jap owes, so jap shows");
  ok(ids.indexOf("vagmi") < 0, "vagmi is square, so vagmi is folded out");
});

test("guests fold into Other guests once the budget is exhausted", function () {
  ["g1", "g2", "g3", "g4", "g5"].forEach(function (id, i) {
    registerPerson({ id: id, name: "Guest" + (i + 1), flat: "b002", kind: "visitor" });
  });
  var bal = { dutta: 15000, g1: -5000, g2: -4000, g3: -3000, g4: -2000, g5: -1000 };
  var g = collapseGroups(bal, { homeFlat: "b002", guestBudget: 3 });
  eq(g.tier2.length, 3, "respects the node budget");
  var folded = g.tier2.filter(function (n) { return n.id === "@guests"; })[0];
  ok(folded, "an Other guests node appeared");
  eq(folded.net, -15000 + 5000 + 4000, "carries the aggregate of the folded members");
  eq(folded.members.length, 3);
  ok(g.tier2[0].id === "g1", "the biggest guest debt stays named");
});

test("a narrow budget folds every guest rather than overflowing", function () {
  var bal = { dutta: 15000, g1: -5000, g2: -4000, g3: -6000 };
  var g = collapseGroups(bal, { homeFlat: "b002", guestBudget: 2 });
  ok(g.tier2.length <= 2, "never exceeds the budget");
});

test("membersOfNode expands a collapsed group back to individuals", function () {
  var bal = { dutta: 23000, aryan: -15000, kunsh: -8000 };
  var g = collapseGroups(bal, { homeFlat: "b002", guestBudget: 4 });
  var ids = membersOfNode(g, "@b603");
  ok(ids.indexOf("aryan") >= 0 && ids.indexOf("kunsh") >= 0, "names the individuals");
  eq(membersOfNode(g, "dutta").join(","), "dutta", "a person node is just itself");
  eq(membersOfNode(g, "nope").length, 0, "unknown node degrades to empty");
});

test("b603 is the mirror image of b002", function () {
  var g = collapseGroups({ aryan: 9000, dutta: -9000 }, { homeFlat: "b603", guestBudget: 4 });
  eq(g.tier1.map(function (n) { return n.id; }).join(","), "aryan,kunsh,vidip,vidu");
  ok(g.tier2.some(function (n) { return n.id === "@b002"; }), "b002 collapses from that side");
});

/* ============================================================
   Guard rails
   ============================================================ */

test("the sanity ceiling is one lakh rupees", function () {
  eq(MAX_PAISE, 10000000);
  ok(parseAmount("100000") <= MAX_PAISE, "a lakh is allowed");
  ok(parseAmount("100000.01") > MAX_PAISE, "a paisa over is caught");
});

/* ============================================================
   Runner
   ============================================================ */

export function run() {
  return suite.map(function (t) {
    try {
      t.fn();
      return { name: t.name, ok: true };
    } catch (e) {
      return { name: t.name, ok: false, msg: (e && e.message) ? e.message : String(e) };
    }
  });
}

export function count() { return suite.length; }
