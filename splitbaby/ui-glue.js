/* ============================================================
   Splitbaby — glass interactions

   The same cursor spotlight and tap ripple as ../assets/ui.js,
   but delegated from the document instead of bound per element.
   This app re-renders its cards constantly, and per-element
   binding would only ever decorate the first paint.

   Pure progressive enhancement: with this file absent the cards
   are still static glass, which looks fine.
   ============================================================ */
(function () {
  "use strict";

  if (!("PointerEvent" in window)) return;

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function card(target) {
    return target && target.closest ? target.closest(".card, .option") : null;
  }

  document.addEventListener("pointermove", function (e) {
    var c = card(e.target);
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty("--mx", (e.clientX - r.left) + "px");
    c.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });

  document.addEventListener("pointerdown", function (e) {
    if (reduce) return;
    var c = card(e.target);
    if (!c) return;
    /* a ripple under a text field is noise, not feedback */
    if (e.target.closest("input, textarea, select")) return;

    var r = c.getBoundingClientRect();
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
  }, { passive: true });
})();
