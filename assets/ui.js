/* ============================================================
   Dutta Residence — glass interactions (test)
   • cursor spotlight: feeds --mx/--my to the card's ::before
   • tap ripple: soft circle expanding from the touch point
   Pure progressive enhancement — no JS = static glass, still fine.
   ============================================================ */
(function () {
  "use strict";

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function onMove(e) {
    var c = e.currentTarget, r = c.getBoundingClientRect();
    c.style.setProperty("--mx", (e.clientX - r.left) + "px");
    c.style.setProperty("--my", (e.clientY - r.top) + "px");
  }

  function onDown(e) {
    if (reduce) return;
    var c = e.currentTarget, r = c.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2.2;
    var s = document.createElement("span");
    s.className = "ripple";
    s.style.width = s.style.height = size + "px";
    s.style.left = (e.clientX - r.left) + "px";
    s.style.top = (e.clientY - r.top) + "px";
    c.appendChild(s);
    s.addEventListener("animationend", function () {
      if (s.parentNode) s.parentNode.removeChild(s);
    });
  }

  function init() {
    if (!("PointerEvent" in window)) return; // old browsers: skip, static glass
    var els = document.querySelectorAll(".card, .option");
    for (var i = 0; i < els.length; i++) {
      els[i].addEventListener("pointermove", onMove);
      els[i].addEventListener("pointerdown", onDown);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
