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

/* ============================================================
   Dutta Residence — gallery lightbox
   Click (or keyboard-activate) any figure in a .gallery to open
   it full view: arrows / swipe to move within that gallery, Esc
   or the backdrop to leave, and a real Fullscreen API toggle.
   Progressive enhancement — with JS off the galleries are
   exactly the static grids they were before.
   ============================================================ */
(function () {
  "use strict";

  var ICON = {
    close:  '<path d="M18 6 6 18M6 6l12 12"/>',
    prev:   '<path d="M15 18l-6-6 6-6"/>',
    next:   '<path d="M9 18l6-6-6-6"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    shrink: '<path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3"/>'
  };

  var lb, stage, imgEl, capEl, countEl, btnPrev, btnNext, btnFull, btnClose;
  var group = [], index = 0, lastFocus = null, built = false;

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function ctrl(cls, label, icon) {
    var b = el("button", "lb-ctrl " + cls, lb);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
                  'stroke-linecap="round" stroke-linejoin="round">' + icon + "</svg>";
    return b;
  }

  function canFull() { return !!(lb.requestFullscreen || lb.webkitRequestFullscreen); }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  function exitFull() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }

  function toggleFull() {
    if (isFull()) { exitFull(); return; }
    var p = lb.requestFullscreen ? lb.requestFullscreen()
          : lb.webkitRequestFullscreen ? lb.webkitRequestFullscreen()
          : null;
    if (p && p.catch) p.catch(function () { /* denied — overlay still works */ });
  }

  function syncFull() {
    if (!btnFull) return;
    var on = isFull();
    btnFull.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
                        'stroke-linecap="round" stroke-linejoin="round">' + (on ? ICON.shrink : ICON.expand) + "</svg>";
    btnFull.setAttribute("aria-label", on ? "Exit fullscreen" : "Enter fullscreen");
  }

  function build() {
    lb = el("div", "lb");
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Image viewer");

    stage   = el("div", "lb-stage", lb);
    imgEl   = el("img", "lb-img", stage);
    imgEl.alt = "";
    capEl   = el("p", "lb-cap", stage);
    countEl = el("span", "lb-count", stage);

    /* DOM order sets the tab order */
    btnPrev  = ctrl("lb-prev", "Previous image", ICON.prev);
    btnNext  = ctrl("lb-next", "Next image", ICON.next);
    btnFull  = ctrl("lb-full", "Enter fullscreen", ICON.expand);
    btnClose = ctrl("lb-close", "Close viewer", ICON.close);

    btnPrev.addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
    btnNext.addEventListener("click", function (e) { e.stopPropagation(); step(1); });
    btnFull.addEventListener("click", function (e) { e.stopPropagation(); toggleFull(); });
    btnClose.addEventListener("click", function (e) { e.stopPropagation(); close(); });

    /* backdrop closes; the image itself does not */
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target === stage) close(); });
    imgEl.addEventListener("click", function (e) { e.stopPropagation(); });

    document.addEventListener("fullscreenchange", syncFull);
    document.addEventListener("webkitfullscreenchange", syncFull);

    var x0 = null;
    lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    if (!canFull()) btnFull.hidden = true;

    document.body.appendChild(lb);
    built = true;
  }

  function srcOf(fig) {
    var im = fig.querySelector("img");
    return im ? (im.currentSrc || im.src) : "";
  }

  function preload(i) {
    if (group.length < 2) return;
    var s = srcOf(group[(i + group.length) % group.length]);
    if (s) { var p = new Image(); p.src = s; }
  }

  function show(i) {
    if (!group.length) return;
    index = (i + group.length) % group.length;

    var fig = group[index];
    var im  = fig.querySelector("img");
    imgEl.src = srcOf(fig);
    imgEl.alt = im ? (im.alt || "") : "";

    var figcap = fig.querySelector("figcaption");
    var cap = figcap ? figcap.textContent.trim() : (im ? im.alt || "" : "");
    capEl.textContent = cap;
    capEl.hidden = !cap;

    var multi = group.length > 1;
    countEl.textContent = multi ? (index + 1) + " / " + group.length : "";
    btnPrev.hidden = !multi;
    btnNext.hidden = !multi;

    preload(index + 1);
    preload(index - 1);
  }

  function step(d) { show(index + d); }

  function focusable() {
    var all = [btnPrev, btnNext, btnFull, btnClose], out = [];
    for (var i = 0; i < all.length; i++) if (!all[i].hidden) out.push(all[i]);
    return out;
  }

  function trap(e) {
    var f = focusable();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFull(); }
    else if (e.key === "Tab") { trap(e); }
  }

  function open(figs, i) {
    if (!built) build();
    group = figs;
    lastFocus = document.activeElement;
    show(i);
    document.body.classList.add("lb-lock");
    void lb.offsetWidth;             /* flush styles so the fade actually runs */
    lb.classList.add("open");
    btnClose.focus();
    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (!lb || !lb.classList.contains("open")) return;
    if (isFull()) exitFull();
    lb.classList.remove("open");
    document.body.classList.remove("lb-lock");
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    /* release the decoded bitmap once the fade has finished */
    window.setTimeout(function () {
      if (!lb.classList.contains("open")) imgEl.removeAttribute("src");
    }, 400);
  }

  function initGalleries() {
    var galleries = document.querySelectorAll(".gallery");
    for (var g = 0; g < galleries.length; g++) {
      var figs = [].slice.call(galleries[g].querySelectorAll("figure")).filter(function (f) {
        return !!f.querySelector("img");
      });
      if (!figs.length) continue;

      for (var i = 0; i < figs.length; i++) {
        (function (fig, idx, all) {
          var im = fig.querySelector("img");
          fig.classList.add("lb-able");
          fig.tabIndex = 0;
          fig.setAttribute("role", "button");
          fig.setAttribute("aria-label", "Open full view" + (im.alt ? ": " + im.alt : ""));
          fig.addEventListener("click", function () { open(all, idx); });
          fig.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
              e.preventDefault();
              open(all, idx);
            }
          });
        })(figs[i], i, figs);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGalleries);
  } else {
    initGalleries();
  }
})();
