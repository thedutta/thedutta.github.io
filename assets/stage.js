/* ============================================================
   stage.js — the pinned set piece.

   One word holds the viewport while the page scrolls past it; at
   each screen of scroll the word, its note, the counter and the
   index rail all advance together.

   Built on `position: sticky`, not on a scroll library.

   The reference site pins with GSAP ScrollTrigger, which it needs
   because Lenis has taken over the scroll and ScrollTrigger has to
   be told about it through scrollerProxy. Native scrolling was the
   choice here, and with native scrolling sticky already does the
   pinning — correctly, with no spacer element and no layout shift.
   What is left is arithmetic: how far through the track are we.
   That is the whole file. Importing ~70KB of GSAP onto the first
   page a visitor loads to do this would be a bad trade.
   ============================================================ */
(function () {
  "use strict";

  function init() {
    var stage = document.querySelector(".stage");
    if (!stage) return;

    var track = stage.querySelector(".stage-track");
    var pin   = stage.querySelector(".stage-pin");
    var words = stage.querySelectorAll(".stage-word");
    var notes = stage.querySelectorAll(".stage-note");
    var items = stage.querySelectorAll(".stage-index li");
    var count = stage.querySelector(".stage-i");
    if (!track || !pin || !words.length) return;

    var n = words.length;
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

    /* ---- split each word so it can cascade in letter by letter ----
       The word is short and static, so this is done once at load and
       the original string is kept as the accessible name. */
    if (!reduce) {
      for (var w = 0; w < n; w++) {
        var el = words[w], text = el.textContent;
        el.setAttribute("aria-label", text);
        var holder = document.createElement("span");
        holder.setAttribute("aria-hidden", "true");
        for (var c = 0; c < text.length; c++) {
          var ch = document.createElement("span");
          ch.className = "ch";
          ch.style.setProperty("--i", c);
          ch.textContent = text[c];
          holder.appendChild(ch);
        }
        el.textContent = "";
        el.appendChild(holder);
      }
    }

    /* ---- the track is sized in JS so the number of words is the
       single source of truth: add a <span class="stage-word"> and a
       matching note, and the scroll distance follows. ---- */
    function size() {
      track.style.height = (n * 100) + "dvh";
    }

    var active = -1;

    function show(i) {
      if (i === active) return;
      active = i;
      for (var k = 0; k < n; k++) {
        var on = (k === i);
        words[k].classList.toggle("is-on", on);
        if (notes[k]) notes[k].classList.toggle("is-on", on);
        if (items[k]) {
          items[k].classList.toggle("is-on", on);
          if (on) items[k].setAttribute("aria-current", "true");
          else items[k].removeAttribute("aria-current");
        }
      }

      // on a phone the index rail is wider than the screen, so the
      // active discipline has to be brought into view or the reader
      // sees a highlight they cannot find
      var rail = stage.querySelector(".stage-index");
      var item = items[i];
      if (rail && item && rail.scrollWidth > rail.clientWidth + 4) {
        var rr = rail.getBoundingClientRect(), ir = item.getBoundingClientRect();
        if (ir.left < rr.left + 8 || ir.right > rr.right - 8) {
          var to = rail.scrollLeft + (ir.left - rr.left) - 16;
          try { rail.scrollTo({ left: to, behavior: reduce ? "auto" : "smooth" }); }
          catch (e) { rail.scrollLeft = to; }
        }
      }
      if (count) count.textContent = (i + 1 < 10 ? "0" : "") + (i + 1);
    }

    var raf = 0;

    function measure() {
      raf = 0;
      var r = track.getBoundingClientRect();
      var span = r.height - pin.offsetHeight;      // scrollable distance inside the pin
      if (span <= 0) { show(0); return; }
      var p = (-r.top) / span;                     // 0 at the top of the track, 1 at the end
      p = p < 0 ? 0 : (p > 1 ? 1 : p);
      var i = Math.floor(p * n);
      if (i >= n) i = n - 1;
      show(i);
    }

    function onScroll() {
      if (!raf) raf = window.requestAnimationFrame(measure);
    }

    size();
    show(0);
    measure();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { size(); onScroll(); }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
