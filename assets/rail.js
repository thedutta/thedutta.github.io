/* ============================================================
   rail.js — content left, media right, scroll-synced.

   Two states:
     SYNCED   (default) the paragraph crossing mid-viewport drives
              the media pane, which scrolls to its figure and holds.
     BROWSING the reader took the pane over; the pane stops
              following and a resync chip appears.

   State transitions listen for INTENT (wheel / touch / pointer /
   nav keys), never for `scroll`. Programmatic scrolls emit scroll
   events indistinguishable from real ones, which is where this
   pattern normally breaks — no scroll listener, no guard flags,
   no race.

   Progressive enhancement: with JS off the rail is a plain grid,
   the pane scrolls on its own, and neither injected control
   exists. Nothing is ever hidden by CSS alone.
   ============================================================ */
(function () {
  "use strict";

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var BEHAVIOR = reduce ? "auto" : "smooth";
  var WIDE = "(min-width: 1024px)";
  var STORE = "rail.bar.collapsed";

  function wide() {
    try { return window.matchMedia(WIDE).matches; } catch (e) { return true; }
  }

  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function setup(rail) {
    var pane = rail.querySelector(".rail-media");
    var text = rail.querySelector(".rail-text");
    if (!pane || !text) return;

    var figs   = pane.querySelectorAll("figure[id]");
    var blocks = text.querySelectorAll("[data-media]");
    if (!figs.length || !blocks.length) return;

    var byId = {};
    for (var i = 0; i < figs.length; i++) byId[figs[i].id] = figs[i];

    var activeId = null;
    var state = "synced";
    rail.setAttribute("data-rail-state", "synced");

    /* ---- moving the pane ------------------------------------------- */
    function paneScrollTo(fig) {
      // rect delta works whatever the offsetParent turns out to be
      var pr = pane.getBoundingClientRect();
      var fr = fig.getBoundingClientRect();
      try {
        if (wide()) pane.scrollTo({ top:  pane.scrollTop  + (fr.top  - pr.top),  behavior: BEHAVIOR });
        else        pane.scrollTo({ left: pane.scrollLeft + (fr.left - pr.left), behavior: BEHAVIOR });
      } catch (e) {                       // older engines: no options object
        if (wide()) pane.scrollTop  = pane.scrollTop  + (fr.top  - pr.top);
        else        pane.scrollLeft = pane.scrollLeft + (fr.left - pr.left);
      }
    }

    function activate(id, move) {
      var fig = byId[id];
      if (!fig) return;
      if (activeId !== id) {
        if (activeId && byId[activeId]) byId[activeId].removeAttribute("data-active");
        fig.setAttribute("data-active", "true");
        activeId = id;
      }
      if (move) paneScrollTo(fig);
    }

    /* ---- state ------------------------------------------------------ */
    function toBrowsing() {
      if (state === "browsing") return;
      state = "browsing";
      rail.setAttribute("data-rail-state", "browsing");
    }

    function toSynced(force) {
      if (state === "synced" && !force) return;
      state = "synced";
      rail.setAttribute("data-rail-state", "synced");
      if (activeId) activate(activeId, true);
    }

    // intent on the pane hands control to the reader
    pane.addEventListener("wheel",      toBrowsing, { passive: true });
    pane.addEventListener("touchstart", toBrowsing, { passive: true });
    pane.addEventListener("pointerdown", toBrowsing);
    pane.addEventListener("keydown", function (e) {
      if (e.key && /^(Arrow|Page|Home|End| )/.test(e.key)) toBrowsing();
    });

    // intent anywhere else hands it back
    function outside(e) { if (!pane.contains(e.target)) toSynced(); }
    document.addEventListener("wheel",      outside, { passive: true });
    document.addEventListener("touchstart", outside, { passive: true });

    /* ---- which paragraph is being read ------------------------------ */
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        var best = null, bestD = Infinity, mid = window.innerHeight / 2;
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          var r = entries[i].target.getBoundingClientRect();
          var d = Math.abs((r.top + r.bottom) / 2 - mid);
          if (d < bestD) { bestD = d; best = entries[i].target; }
        }
        if (best) activate(best.getAttribute("data-media"), state === "synced");
      }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });

      for (var b = 0; b < blocks.length; b++) io.observe(blocks[b]);
    }

    // something is always active, even before the first scroll
    activate(blocks[0].getAttribute("data-media"), false);

    /* ---- resync chip ------------------------------------------------ */
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "rail-chip";
    chip.innerHTML = svg('<path d="M3 12a9 9 0 0 1 15.7-6H21"/><path d="M21 3v5h-5"/>' +
                         '<path d="M21 12a9 9 0 0 1-15.7 6H3"/><path d="M3 21v-5h5"/>') +
                     "<span>Resync</span>";
    chip.addEventListener("click", function () { toSynced(true); });
    rail.appendChild(chip);

    /* ---- mobile: collapsible bar ------------------------------------ */
    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "rail-handle";
    rail.appendChild(handle);

    function setCollapsed(on) {
      pane.classList.toggle("is-collapsed", on);
      rail.classList.toggle("is-bar-collapsed", on);
      handle.setAttribute("aria-expanded", on ? "false" : "true");
      handle.setAttribute("aria-label", on ? "Show figures" : "Hide figures");
      try { window.localStorage.setItem(STORE, on ? "1" : "0"); } catch (e) {}
    }

    var stored = null;
    try { stored = window.localStorage.getItem(STORE); } catch (e) {}
    setCollapsed(stored === "1");

    handle.addEventListener("click", function () {
      setCollapsed(!pane.classList.contains("is-collapsed"));
    });

    /* ---- keep the active figure put across the breakpoint ----------- */
    try {
      var mq = window.matchMedia(WIDE);
      var onChange = function () { if (activeId && state === "synced") activate(activeId, true); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) {}
  }

  /* ============================================================
     Jump strip — highlight the section being read.
     The strip itself is plain anchors and works with JS off; this
     only adds aria-current and keeps the active chip in view.
     ============================================================ */
  function setupJump() {
    var strip = document.querySelector(".jump");
    if (!strip || !("IntersectionObserver" in window)) return;

    var links = {}, targets = [];
    var as = strip.querySelectorAll('a[href^="#"]');
    for (var i = 0; i < as.length; i++) {
      var id = as[i].getAttribute("href").slice(1);
      var t = document.getElementById(id);
      if (!t) continue;                       // never mark a dead anchor
      links[id] = as[i];
      targets.push(t);
    }
    if (!targets.length) return;

    // the strip may list sections out of document order (Status leads,
    // because it answers the reader's first question), so sort before
    // using targets[0] as the "nothing has scrolled yet" fallback
    targets.sort(function (a, b) {
      return (a.compareDocumentPosition(b) & 4) ? -1 : 1;   // 4 = FOLLOWING
    });

    var currentId = null;

    function mark(id) {
      if (id === currentId) return;
      if (currentId && links[currentId]) links[currentId].removeAttribute("aria-current");
      var a = links[id];
      if (a) {
        a.setAttribute("aria-current", "true");
        var sr = strip.getBoundingClientRect(), ar = a.getBoundingClientRect();
        if (ar.left < sr.left + 8 || ar.right > sr.right - 8) {
          var to = strip.scrollLeft + (ar.left - sr.left) - 16;
          try { strip.scrollTo({ left: to, behavior: BEHAVIOR }); }
          catch (e) { strip.scrollLeft = to; }
        }
      }
      currentId = id;
    }

    // the last section whose top has crossed the reading line is the
    // one being read; recomputed from all targets, because an
    // observer callback only carries the entries that changed
    function pick() {
      var line = window.innerHeight * 0.3;
      var best = null, bestTop = -Infinity;
      for (var i = 0; i < targets.length; i++) {
        var top = targets[i].getBoundingClientRect().top;
        if (top <= line && top > bestTop) { bestTop = top; best = targets[i]; }
      }
      mark((best || targets[0]).id);
    }

    var io = new IntersectionObserver(pick, { rootMargin: "-10% 0px -55% 0px", threshold: 0 });
    for (var j = 0; j < targets.length; j++) io.observe(targets[j]);
    pick();
  }

  function init() {
    var rails = document.querySelectorAll(".rail");
    for (var i = 0; i < rails.length; i++) setup(rails[i]);
    setupJump();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
