/* ============================================================
   Reveal-on-scroll — staggered entrance for .reveal elements.
   Standalone (the portfolio site drops the i18n engine that
   used to drive this). Never leaves content blank: if anything
   fails or motion is reduced, elements are shown immediately.
   ============================================================ */
(function () {
  "use strict";

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function showAll(els) {
    for (var i = 0; i < els.length; i++) { els[i].classList.remove("pre"); els[i].classList.add("in"); }
  }

  function init() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    if (reduce || !("IntersectionObserver" in window)) { showAll(els); return; }

    // hide first (added by JS so no-JS users never see a blank page)
    for (var i = 0; i < els.length; i++) els[i].classList.add("pre");

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Math.min(parseInt(el.getAttribute("data-rev-i") || "0", 10), 6) * 70;
        setTimeout(function () { el.classList.remove("pre"); el.classList.add("in"); }, delay);
        obs.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });

    // stagger siblings: index within parent for a gentle cascade
    var lastParent = null, n = 0;
    for (var j = 0; j < els.length; j++) {
      var p = els[j].parentNode;
      if (p !== lastParent) { lastParent = p; n = 0; }
      els[j].setAttribute("data-rev-i", n++);
      io.observe(els[j]);
    }

    // safety: anything still hidden after 1.6s gets shown
    setTimeout(function () {
      var still = document.querySelectorAll(".reveal.pre");
      showAll(still);
    }, 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
