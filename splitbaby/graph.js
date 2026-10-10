/* ============================================================
   Splitbaby — money-flow graph

   A flowchart of who owes whom. Tier 1 is this flat's members,
   individually. Tier 2 holds the guests and the whole other
   flat as ONE entity, at equal priority, auto-compacting into
   "Other guests" when the width cannot fit them.

   Connectors are smooth cubic curves rather than right angles:
   money moving between people reads better as a flow than as a
   circuit diagram, and arcs of differing depth nest instead of
   colliding. Cross-tier edges take an S; same-tier edges dip
   into the gap, the widest span dipping deepest so the arcs
   nest inside one another.

   Generated SVG, no chart library: crisp at any size, themed
   from the CSS variables in app.css.
   ============================================================ */

import { formatMoney } from "./ledger.js";
import { personColor, photoUrl } from "./config.js";

const NS = "http://www.w3.org/2000/svg";

const BOX_H    = 84;
const BAR_H    = 34;   /* caption fading in over the bottom of the photo */
const GAP_X    = 8;
const MIN_BOX  = 62;
const MAX_BOX  = 150;
const PAD_TOP  = 6;
const DIP      = 22;     /* first same-tier arc depth   */
const DIP_STEP = 15;     /* each nested arc goes deeper */

/* How many tier-2 nodes the width can carry. Drives the
   auto-compaction decision in ledger.collapseGroups. */
export function guestBudget(width) {
  return Math.max(2, Math.min(5, Math.floor((width || 340) / 96)));
}

function el(name, attrs, parent) {
  var n = document.createElementNS(NS, name);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === "href") n.setAttributeNS("http://www.w3.org/1999/xlink", "href", attrs[k]);
    n.setAttribute(k, attrs[k]);
  });
  if (parent) parent.appendChild(n);
  return n;
}

/* Thresholds are in PAISE, which is easy to get wrong by a
   factor of a hundred: a lakh is 1e7 paise, not 1e5. A node has
   a whole box to itself so it stays exact into the lakhs; an
   edge chip squeezes between curves, so it compacts sooner. */
function rupees(abs) { return "₹" + Math.round(abs / 100).toLocaleString("en-IN"); }
function trim(v) { return v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ""); }

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
  var max = Math.max(3, Math.floor((boxW - 8) / perChar));
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

/* ------------------------------------------------------------
   Curves
   ------------------------------------------------------------ */

function cubic(p0, c1, c2, p3) {
  return "M " + p0.x.toFixed(1) + " " + p0.y.toFixed(1) +
         " C " + c1.x.toFixed(1) + " " + c1.y.toFixed(1) +
         ", " + c2.x.toFixed(1) + " " + c2.y.toFixed(1) +
         ", " + p3.x.toFixed(1) + " " + p3.y.toFixed(1);
}

function cubicAt(p0, c1, c2, p3, t) {
  var u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y
  };
}

/* tangent at the end, for pointing the arrowhead */
function endAngle(c2, p3) {
  return Math.atan2(p3.y - c2.y, p3.x - c2.x) * 180 / Math.PI;
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */

/* Keeping the decoded images alive stops the browser dropping and
   refetching them, which is what made every face blink at once. */
var warm = {};
function preload(url) {
  if (!url || warm[url]) return;
  var i = new Image();
  i.src = url;
  warm[url] = i;
}

/* The app rebuilds its whole DOM on every render, so this module
   hands back the SAME <svg> when nothing about it has changed.
   Re-creating <image> elements is what caused the flicker. */
var cache = { sig: null, svg: null };
var currentOnSelect = null;

function signature(t1, t2, edges, selNode, width, plain) {
  var parts = [width, selNode || "", plain ? "p" : "o"];
  t1.concat(t2).forEach(function (n) {
    parts.push(n.id + ":" + n.kind + ":" + n.net + ":" + n.label + ":" + n.sub);
  });
  edges.forEach(function (e) { parts.push(e.from + ">" + e.to + "=" + e.amountPaise); });
  return parts.join("|");
}

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

  /* always point the cached handlers at the newest callback */
  currentOnSelect = o.onSelect;

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

  var sig = signature(t1, t2, edges, selNode, width, !!o.plain);
  if (cache.sig === sig && cache.svg) {
    host.appendChild(cache.svg);
    return { height: cache.height, selectedNode: selNode, reused: true };
  }

  /* ---- horizontal placement ---- */
  var widest = Math.max(t1.length, t2.length, 1);
  var boxW = Math.max(MIN_BOX, Math.min(MAX_BOX,
    Math.floor((width - (widest - 1) * GAP_X) / widest)));

  var placed = {};
  function placeRow(list) {
    var total = list.length * boxW + (list.length - 1) * GAP_X;
    var x0 = Math.max(0, (width - total) / 2);
    list.forEach(function (n, i) {
      placed[n.id] = {
        node: n, x: x0 + i * (boxW + GAP_X), y: 0,
        w: boxW, h: BOX_H, tier: tierOf[n.id]
      };
    });
  }
  placeRow(t1);
  placeRow(t2);

  /* ---- ports: fan each node's connections across its width so
     two curves never leave from the same point ---- */
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
    var span = p.w * 0.56;
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

  /* ---- same-tier arc depth: the widest span dips deepest, so
     arcs nest inside one another instead of crossing ---- */
  function assignDips(list) {
    list.sort(function (a, b) {
      return Math.abs(a._sx - a._tx) - Math.abs(b._sx - b._tx);
    });
    list.forEach(function (e, i) { e.dip = DIP + i * DIP_STEP; });
    return list.length ? list[list.length - 1].dip : 0;
  }

  var same1 = edges.filter(function (e) { return tierOf[e.from] === 1 && tierOf[e.to] === 1; });
  var same2 = edges.filter(function (e) { return tierOf[e.from] === 2 && tierOf[e.to] === 2; });
  var cross = edges.filter(function (e) { return tierOf[e.from] !== tierOf[e.to]; });

  var maxDip1 = assignDips(same1);
  var maxDip2 = assignDips(same2);

  /* Chips all sat at t=0.5, which dropped them onto one horizontal
     band and piled them up. Walk a repeating offset so neighbouring
     curves label at different heights. */
  var TS = [0.32, 0.46, 0.38, 0.52, 0.28, 0.42];
  cross.slice()
    .sort(function (a, b) { return (a._sx + a._tx) - (b._sx + b._tx); })
    .forEach(function (e, i) { e.labelT = TS[i % TS.length]; });

  /* ---- vertical geometry ---- */
  var tier1Y = PAD_TOP;
  var gap = Math.max(cross.length ? 78 : 28, maxDip1 + 30);
  var tier2Y = tier1Y + BOX_H + gap;
  var bottom = maxDip2 ? maxDip2 + 16 : 6;
  var height = tier2Y + (t2.length ? BOX_H : 0) + bottom;

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

  cache.sig = sig;
  cache.svg = svg;
  cache.height = height;

  var defs = el("defs", null, svg);

  /* one gradient, reused by every caption bar */
  var grad = el("linearGradient", { id: "sb-bar-fade", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
  el("stop", { offset: "0", "stop-color": "#05060a", "stop-opacity": "0" }, grad);
  el("stop", { offset: "0.45", "stop-color": "#05060a", "stop-opacity": "0.62" }, grad);
  el("stop", { offset: "1", "stop-color": "#05060a", "stop-opacity": "0.92" }, grad);
  var gEdges = el("g", null, svg);
  var gLabels = el("g", null, svg);
  var gNodes = el("g", null, svg);

  var labelQueue = [];

  function drawEdge(e) {
    var s = placed[e.from], t = placed[e.to];
    if (!s || !t) return;

    var sx = e._sx, tx = e._tx, p0, c1, c2, p3;

    if (s.tier === t.tier) {
      /* dip out of the gap-facing edge and back up again */
      var baseY = s.y + s.h;
      p0 = { x: sx, y: baseY };
      p3 = { x: tx, y: baseY };
      c1 = { x: sx, y: baseY + e.dip };
      c2 = { x: tx, y: baseY + e.dip };
    } else {
      /* an S between the two tiers */
      var sy = s.tier === 1 ? s.y + s.h : s.y;
      var ty = t.tier === 1 ? t.y + t.h : t.y;
      var k = (ty - sy) * 0.55;
      p0 = { x: sx, y: sy };
      p3 = { x: tx, y: ty };
      c1 = { x: sx, y: sy + k };
      c2 = { x: tx, y: ty - k };
    }

    var on = !selNode || e.from === selNode || e.to === selNode;
    var mark = selNode ? (on ? " on" : " dim") : "";

    el("path", { class: "g-edge" + mark, d: cubic(p0, c1, c2, p3) }, gEdges);

    /* arrowhead rotated onto the curve's tangent */
    var ang = endAngle(c2, p3);
    el("path", {
      class: "g-arrow" + mark,
      d: "M 0 0 L -7 -3.4 L -7 3.4 Z",
      transform: "translate(" + p3.x.toFixed(1) + "," + p3.y.toFixed(1) + ") rotate(" + ang.toFixed(1) + ")"
    }, gEdges);

    /* Only the selected party's edges get a price tag. Labelling
       every one is what turns a busy ledger into soup. Placement is
       deferred so overlaps can be resolved once all curves exist. */
    if (!on) return;
    labelQueue.push({ e: e, p0: p0, c1: c1, c2: c2, p3: p3 });
  }

  cross.forEach(drawEdge);
  same1.forEach(drawEdge);
  same2.forEach(drawEdge);

  /* A fixed stagger is not enough on its own: two curves can still
     meet at the same point. Walk each label along its own curve
     until it stops overlapping the ones already placed. */
  var placedLabels = [];
  function hits(r) {
    for (var i = 0; i < placedLabels.length; i++) {
      var q = placedLabels[i];
      if (!(r.x2 < q.x1 || r.x1 > q.x2 || r.y2 < q.y1 || r.y1 > q.y2)) return true;
    }
    return false;
  }

  labelQueue.forEach(function (L) {
    var label = edgeAmount(L.e.amountPaise);
    var cw = label.length * 5.4 + 11;
    var base = L.e.labelT || 0.42;
    /* Bias toward the SOURCE end. Edges converge on whoever is owed,
       so near the target every chip lands in the same spot, while the
       sources are spread across the row. */
    var offsets = [0, -0.08, -0.16, 0.08, -0.24, 0.16, -0.32, 0.24, -0.40];
    var best = null;

    for (var i = 0; i < offsets.length; i++) {
      var t = Math.min(0.88, Math.max(0.12, base + offsets[i]));
      var m = cubicAt(L.p0, L.c1, L.c2, L.p3, t);
      var r = { x1: m.x - cw / 2 - 2, x2: m.x + cw / 2 + 2, y1: m.y - 10, y2: m.y + 10, m: m };
      if (!hits(r)) { best = r; break; }
    }

    /* Nowhere clear to put it: leave it off rather than stack two
       amounts on top of each other. The list below is exact anyway. */
    if (!best) return;

    placedLabels.push(best);
    var g = el("g", { class: "e-lab" + (selNode ? " on" : "") }, gLabels);
    el("rect", { class: "e-chip", x: best.m.x - cw / 2, y: best.m.y - 8, width: cw, height: 16, rx: 8 }, g);
    el("text", { class: "e-amt", x: best.m.x, y: best.m.y + 0.5 }, g).textContent = label;
  });

  /* ---- nodes ---- */
  var clipSeq = 0;

  function drawNode(n) {
    var p = placed[n.id];
    if (!p) return;

    var isSel = selNode === n.id;
    var isGroup = n.kind === "group";
    var tone = o.plain ? "" : (n.net > 0 ? " good" : (n.net < 0 ? " bad" : " zero"));
    var amtText = clip(o.plain ? plainAmount(n.net) : nodeAmount(n.net), p.w - 6, 6.4);

    var g = el("g", {
      class: "g-node" + (isGroup ? " group" : "") + (isSel ? " sel" : (selNode ? " dim" : "")),
      role: "button", tabindex: "0",
      "aria-pressed": isSel ? "true" : "false",
      "aria-label": n.label + ", " + (o.plain ? plainAmount(n.net) : nodeAmount(n.net))
    }, gNodes);

    /* clip id keyed by node, so ids stay stable between renders
       instead of shifting with a counter */
    var cid = "sbclip-" + String(n.id).replace(/[^a-zA-Z0-9]/g, "_");
    var cp = el("clipPath", { id: cid }, defs);
    el("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: 13 }, cp);
    var clipTo = "url(#" + cid + ")";

    var bodyH = p.h - BAR_H;
    var cx = p.x + p.w / 2;
    var url = isGroup ? null : photoUrl(n.id);

    el("rect", { class: "n-box", x: p.x, y: p.y, width: p.w, height: p.h, rx: 13 }, g);

    if (url) {
      /* the photo is the card */
      preload(url);
      el("image", {
        href: url, x: p.x, y: p.y, width: p.w, height: p.h,
        preserveAspectRatio: "xMidYMid slice", "clip-path": clipTo
      }, g);
    } else if (!isGroup) {
      /* no face yet: their tint and their initial, same silhouette */
      el("rect", {
        x: p.x, y: p.y, width: p.w, height: p.h, rx: 13,
        fill: personColor(n.id), opacity: "0.20"
      }, g);
      el("text", {
        class: "n-init", x: cx, y: p.y + bodyH / 2 + 2, "text-anchor": "middle",
        fill: personColor(n.id)
      }, g).textContent = String(n.label || "?").charAt(0).toUpperCase();
    } else {
      el("text", { class: "n-sub", x: cx, y: p.y + bodyH / 2 + 2, "text-anchor": "middle" }, g)
        .textContent = clip(n.sub, p.w, 5.0);
    }

    /* caption bar, fading in so the face is never cut by a hard edge */
    el("rect", {
      x: p.x, y: p.y + p.h - BAR_H, width: p.w, height: BAR_H,
      fill: "url(#sb-bar-fade)", "clip-path": clipTo
    }, g);

    el("text", {
      class: "n-name", x: p.x + 6, y: p.y + p.h - BAR_H + 13, "text-anchor": "start"
    }, g).textContent = clip(n.label, p.w - 6, 6.6);

    el("text", {
      class: "n-amt" + tone, x: p.x + 6, y: p.y + p.h - 11, "text-anchor": "start"
    }, g).textContent = amtText;

    /* frame last, above the photo, so the edge stays crisp */
    el("rect", { class: "n-frame", x: p.x, y: p.y, width: p.w, height: p.h, rx: 13 }, g);

    function pick() { if (currentOnSelect) currentOnSelect(n); }
    g.addEventListener("click", pick);
    g.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); }
    });
  }

  t1.forEach(drawNode);
  t2.forEach(drawNode);

  return { height: height, selectedNode: selNode };
}
