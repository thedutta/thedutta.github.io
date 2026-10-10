/* ============================================================
   Splitbaby — money-flow graph

   A small flowchart: rectangular nodes, orthogonal connectors,
   an amount chip on the edges that matter. Tier 1 is this
   flat's members, individually. Tier 2 holds the guests and the
   whole other flat as ONE entity, at equal priority, auto-
   compacting into "Other guests" when the width cannot fit them.

   Generated SVG rather than a chart library: crisp at any size,
   themed from the CSS variables in app.css, no page weight.

   Routing: every node connects through its gap-facing edge
   (tier 1 from the bottom, tier 2 from the top), down into a
   horizontal lane, across, and into the target. Lanes are
   PACKED — two edges whose horizontal runs do not overlap share
   one lane — which is what keeps a busy ledger from turning
   into a ladder.
   ============================================================ */

import { formatMoney } from "./ledger.js";
import { personColor } from "./config.js";

const NS = "http://www.w3.org/2000/svg";

const BOX_H      = 42;
const GAP_X      = 7;
const MIN_BOX    = 56;
const MAX_BOX    = 118;
const PAD_TOP    = 4;
const LANE_STEP  = 12;
const LANE_INSET = 15;
const CORNER     = 4;

/* How many tier-2 nodes the width can carry. Drives the
   auto-compaction decision in ledger.collapseGroups. */
export function guestBudget(width) {
  return Math.max(2, Math.min(5, Math.floor((width || 340) / 88)));
}

function el(name, attrs, parent) {
  var n = document.createElementNS(NS, name);
  if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
  if (parent) parent.appendChild(n);
  return n;
}

/* Compact forms so a big balance can never overflow a 56px box. */
/* Thresholds are in PAISE, which is easy to get wrong by a factor
   of a hundred: a lakh is 1e7 paise, not 1e5.

   Two tiers of brevity. A node has a whole box to itself, so it
   shows round rupees and stays exact into the lakhs. An edge chip
   has to squeeze between connectors, so it compacts sooner. */

function rupees(abs) {
  return "₹" + Math.round(abs / 100).toLocaleString("en-IN");
}

function trim(v) {
  return v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "");
}

function nodeMoney(abs) {
  if (abs >= 1e9) return "₹" + trim(abs / 1e9) + "Cr";
  if (abs >= 1e7) return "₹" + trim(abs / 1e7) + "L";
  return rupees(abs);
}

function edgeMoney(abs) {
  if (abs >= 1e9) return "₹" + trim(abs / 1e9) + "Cr";
  if (abs >= 1e7) return "₹" + trim(abs / 1e7) + "L";
  if (abs >= 1e6) return "₹" + trim(abs / 1e5) + "k";
  return rupees(abs);
}

function nodeAmount(paise) {
  var abs = Math.abs(paise);
  if (abs < 50) return "settled";
  return (paise < 0 ? "−" : "+") + nodeMoney(abs);
}

function edgeAmount(paise) { return edgeMoney(Math.abs(paise)); }

/* Spend mode shows a plain total, not a signed balance: nobody
   is "owed" their own share of the groceries. */
function plainAmount(paise) {
  var abs = Math.abs(paise);
  return abs ? nodeMoney(abs) : "—";
}

function clip(text, boxW, perChar) {
  var max = Math.max(3, Math.floor((boxW - 7) / perChar));
  var s = String(text || "");
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/* ------------------------------------------------------------
   Map person-level transfers onto node-level edges: a transfer
   involving someone inside a collapsed group becomes an edge on
   that group, and transfers entirely inside one group vanish
   (they are internal, and the list below the graph still names
   them individually).
   ------------------------------------------------------------ */
export function mapEdges(transfers, nodes) {
  var owner = {};
  (nodes.tier1 || []).concat(nodes.tier2 || []).forEach(function (n) {
    n.members.forEach(function (m) { owner[m] = n.id; });
  });

  var merged = {};
  (transfers || []).forEach(function (t) {
    var a = owner[t.from], b = owner[t.to];
    if (!a || !b || a === b) return;
    var key = a + ">" + b;
    if (!merged[key]) merged[key] = { from: a, to: b, amountPaise: 0, parts: [] };
    merged[key].amountPaise += t.amountPaise;
    merged[key].parts.push(t);
  });

  return Object.keys(merged).map(function (k) { return merged[k]; })
    .sort(function (x, y) { return y.amountPaise - x.amountPaise; });
}

/* Greedy interval packing: an edge takes the lowest lane whose
   occupied span it does not touch. */
function packLanes(list) {
  var lanes = [];
  list.forEach(function (e) {
    var lo = Math.min(e._sx, e._tx) - 6;
    var hi = Math.max(e._sx, e._tx) + 6;
    for (var i = 0; i < lanes.length; i++) {
      var clash = lanes[i].some(function (o) { return !(hi < o.lo || lo > o.hi); });
      if (!clash) { lanes[i].push({ lo: lo, hi: hi }); e.lane = i; return; }
    }
    lanes.push([{ lo: lo, hi: hi }]);
    e.lane = lanes.length - 1;
  });
  return lanes.length;
}

/* Rounded orthogonal polyline. */
function orthPath(pts) {
  if (pts.length < 2) return "";
  var d = "M " + pts[0].x + " " + pts[0].y;
  for (var i = 1; i < pts.length - 1; i++) {
    var p = pts[i], prev = pts[i - 1], next = pts[i + 1];
    var inDx = Math.sign(p.x - prev.x), inDy = Math.sign(p.y - prev.y);
    var outDx = Math.sign(next.x - p.x), outDy = Math.sign(next.y - p.y);
    var rIn = (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)) / 2;
    var rOut = (Math.abs(next.x - p.x) + Math.abs(next.y - p.y)) / 2;
    var r = Math.max(0, Math.min(CORNER, rIn, rOut));
    d += " L " + (p.x - inDx * r) + " " + (p.y - inDy * r);
    if (r > 0) d += " Q " + p.x + " " + p.y + " " + (p.x + outDx * r) + " " + (p.y + outDy * r);
  }
  var last = pts[pts.length - 1];
  return d + " L " + last.x + " " + last.y;
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */

export function renderGraph(host, opts) {
  var o = opts || {};
  var nodes = o.nodes || { tier1: [], tier2: [] };
  var allEdges = o.edges || [];
  var selected = o.selected || null;

  /* measure the host itself: deriving width from an ancestor
     double-counts card padding and overflows */
  var width = Math.max(240, Math.floor(o.width || host.clientWidth ||
    (host.parentNode && host.parentNode.clientWidth) || 320));

  host.innerHTML = "";

  var t1 = nodes.tier1 || [], t2 = nodes.tier2 || [];
  if (!t1.length && !t2.length) return null;

  /* ---- which node is highlighted ---- */
  var selNode = null;
  if (selected) {
    t1.concat(t2).forEach(function (n) {
      if (n.members.indexOf(selected) >= 0) selNode = n.id;
    });
  }

  var tierOf = {};
  t1.forEach(function (n) { tierOf[n.id] = 1; });
  t2.forEach(function (n) { tierOf[n.id] = 2; });

  var edges = allEdges.filter(function (e) { return tierOf[e.from] && tierOf[e.to]; });

  /* ---- horizontal placement (y comes once lanes are known) ---- */
  var widest = Math.max(t1.length, t2.length, 1);
  var boxW = Math.max(MIN_BOX, Math.min(MAX_BOX,
    Math.floor((width - (widest - 1) * GAP_X) / widest)));

  var placed = {};
  function placeRow(list, y) {
    var total = list.length * boxW + (list.length - 1) * GAP_X;
    var x0 = Math.max(0, (width - total) / 2);
    list.forEach(function (n, i) {
      placed[n.id] = { node: n, x: x0 + i * (boxW + GAP_X), y: y, w: boxW, h: BOX_H, tier: tierOf[n.id] };
    });
  }
  placeRow(t1, 0);
  placeRow(t2, 0);

  /* ---- ports: spread each node's connections across its box so
     two edges never share a vertical run ---- */
  var touch = {};
  edges.forEach(function (e) {
    var key = e.from + ">" + e.to;
    (touch[e.from] = touch[e.from] || []).push(key);
    (touch[e.to] = touch[e.to] || []).push(key);
  });

  var ports = {};
  Object.keys(touch).forEach(function (id) {
    var p = placed[id];
    if (!p) return;
    var keys = touch[id].slice().sort();
    var span = p.w * 0.62;
    var start = p.x + p.w / 2 - span / 2;
    var map = {};
    keys.forEach(function (k, i) {
      map[k] = keys.length === 1 ? (p.x + p.w / 2) : (start + (span / (keys.length - 1)) * i);
    });
    ports[id] = map;
  });

  edges.forEach(function (e) {
    var key = e.from + ">" + e.to;
    e._sx = (ports[e.from] && ports[e.from][key]) || (placed[e.from].x + boxW / 2);
    e._tx = (ports[e.to] && ports[e.to][key]) || (placed[e.to].x + boxW / 2);
  });

  var mid = edges.filter(function (e) { return !(e.from && tierOf[e.from] === 2 && tierOf[e.to] === 2); });
  var low = edges.filter(function (e) { return tierOf[e.from] === 2 && tierOf[e.to] === 2; });

  var midLanes = packLanes(mid);
  var lowLanes = packLanes(low);

  /* ---- vertical geometry ---- */
  var tier1Y = PAD_TOP;
  var midGap = midLanes ? LANE_INSET * 2 + (midLanes - 1) * LANE_STEP : 22;
  var tier2Y = tier1Y + BOX_H + midGap;
  var lowGap = lowLanes ? LANE_INSET + (lowLanes - 1) * LANE_STEP : 4;
  var height = tier2Y + (t2.length ? BOX_H : 0) + lowGap + 2;

  t1.forEach(function (n) { placed[n.id].y = tier1Y; });
  t2.forEach(function (n) { placed[n.id].y = tier2Y; });

  var svg = el("svg", {
    class: "sb-graph",
    viewBox: "0 0 " + width + " " + height,
    width: "100%", height: String(height),
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "Balances between " + (t1.length + t2.length) + " parties"
  }, host);

  var gEdges = el("g", null, svg);
  var gLabels = el("g", null, svg);
  var gNodes = el("g", null, svg);

  function drawEdge(e, region) {
    var s = placed[e.from], t = placed[e.to];
    if (!s || !t) return;

    var laneY, sy, ty;
    if (region === "mid") {
      laneY = tier1Y + BOX_H + LANE_INSET + e.lane * LANE_STEP;
      sy = s.tier === 1 ? s.y + s.h : s.y;
      ty = t.tier === 1 ? t.y + t.h : t.y;
    } else {
      laneY = tier2Y + BOX_H + 5 + e.lane * LANE_STEP;
      sy = s.y + s.h;
      ty = t.y + t.h;
    }

    var sx = e._sx, tx = e._tx;
    var straight = Math.abs(sx - tx) < 0.5;
    var pts = straight
      ? [{ x: sx, y: sy }, { x: tx, y: ty }]
      : [{ x: sx, y: sy }, { x: sx, y: laneY }, { x: tx, y: laneY }, { x: tx, y: ty }];

    var on = !selNode || e.from === selNode || e.to === selNode;
    var mark = selNode ? (on ? " on" : " dim") : "";

    el("path", { class: "g-edge" + mark, d: orthPath(pts) }, gEdges);

    /* arrowhead pointing into the target */
    var dir = straight ? (ty > sy ? 1 : -1) : (ty < laneY ? -1 : 1);
    var a = 3.6;
    el("path", {
      class: "g-arrow" + mark,
      d: "M " + tx + " " + ty +
         " L " + (tx - a) + " " + (ty + dir * a * 1.5) +
         " L " + (tx + a) + " " + (ty + dir * a * 1.5) + " Z"
    }, gEdges);

    /* Only the selected party's edges get a price tag. Labelling
       all of them is what turns a busy ledger into soup. */
    if (!on) return;
    var label = edgeAmount(e.amountPaise);
    var cw = label.length * 4.7 + 8;
    var cx = straight ? sx : (sx + tx) / 2;
    var cy = straight ? (sy + ty) / 2 : laneY;
    var g = el("g", { class: "e-lab" + (selNode ? " on" : "") }, gLabels);
    el("rect", { class: "e-chip", x: cx - cw / 2, y: cy - 6, width: cw, height: 12, rx: 3 }, g);
    el("text", { class: "e-amt", x: cx, y: cy + 0.5 }, g).textContent = label;
  }

  mid.forEach(function (e) { drawEdge(e, "mid"); });
  low.forEach(function (e) { drawEdge(e, "low"); });

  /* ---- nodes ---- */
  function drawNode(n) {
    var p = placed[n.id];
    if (!p) return;

    var isSel = selNode === n.id;
    var isGroup = n.kind === "group";

    var g = el("g", {
      class: "g-node" + (isGroup ? " group" : "") + (isSel ? " sel" : (selNode ? " dim" : "")),
      role: "button", tabindex: "0",
      "aria-pressed": isSel ? "true" : "false",
      "aria-label": n.label + ", " + (o.plain ? plainAmount(n.net) : nodeAmount(n.net))
    }, gNodes);

    el("rect", { class: "n-box", x: p.x, y: p.y, width: p.w, height: p.h, rx: 6 }, g);

    var cx = p.x + p.w / 2;

    el("text", { class: "n-name", x: cx, y: p.y + (isGroup ? 12 : 15), "text-anchor": "middle" }, g)
      .textContent = clip(n.label, p.w, 6.9);

    if (isGroup) {
      el("text", { class: "n-sub", x: cx, y: p.y + 22.5, "text-anchor": "middle" }, g)
        .textContent = clip(n.sub, p.w, 4.6);
    }

    var tone = o.plain ? "" : (n.net > 0 ? " good" : (n.net < 0 ? " bad" : " zero"));
    el("text", { class: "n-amt" + tone, x: cx, y: p.y + (isGroup ? 33 : 30), "text-anchor": "middle" }, g)
      .textContent = clip(o.plain ? plainAmount(n.net) : nodeAmount(n.net), p.w, 6.2);

    /* a person carries their tint as a shoulder, tying the graph
       to the bars and avatars elsewhere */
    if (!isGroup) {
      el("rect", {
        x: cx - 8, y: p.y - 1, width: 16, height: 2, rx: 1,
        fill: personColor(n.id), opacity: isSel ? "0.95" : "0.5"
      }, g);
    }

    function pick() { if (o.onSelect) o.onSelect(n); }
    g.addEventListener("click", pick);
    g.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); }
    });
  }

  t1.forEach(drawNode);
  t2.forEach(drawNode);

  return { height: height, selectedNode: selNode };
}
