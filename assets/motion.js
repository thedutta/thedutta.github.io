/* ============================================================
   motion.js — the declarative motion contract.

   Everything here is driven by attributes in the HTML, so a new
   page is authored without writing any JavaScript:

     data-reveal="fade|rise|chars|lines"   how it enters
     data-reveal-children                  stagger direct children
     data-delay="0.2"                      extra delay, seconds
     data-parallax="0.25"                  drift factor while in view
     data-odometer="128"                   count up on first sight
     data-accent="#4aa3ff"                 retint the page while read

   `.reveal` is kept as a synonym for data-reveal="rise" because
   thirteen pages already use it. Nothing about those pages needs
   to change for this file to replace reveal.js.

   SUPERSEDES assets/reveal.js. That file showed every remaining
   element on a blanket 1600ms timer, so on a long page the scroll
   reveal only worked for the first 1.6 seconds and everything
   below the fold was already visible by the time it was reached.
   The guard here fires only if the observer never ran at all.
   ============================================================ */
(function () {
  "use strict";

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var hasIO = "IntersectionObserver" in window;
  var root = document.documentElement;

  function attr(el, name) { return el.getAttribute(name); }

  function showAll() {
    var els = document.querySelectorAll(".pre");
    for (var i = 0; i < els.length; i++) {
      els[i].classList.remove("pre");
      els[i].classList.add("in");
    }
  }

  /* ============================================================
     Splitting — chars and lines.
     Both keep the element readable to assistive tech: the original
     string is restored as aria-label and the generated spans are
     hidden from the accessibility tree.
     ============================================================ */

  function splitChars(el) {
    var text = el.textContent;
    if (!text || text.length > 120) return false;   // guard: never shred a paragraph
    el.setAttribute("aria-label", text);
    var frag = document.createDocumentFragment();
    var words = text.split(/(\s+)/);
    var i = 0;
    for (var w = 0; w < words.length; w++) {
      if (/^\s+$/.test(words[w])) { frag.appendChild(document.createTextNode(words[w])); continue; }
      // a word is kept whole so line-breaking still happens between words
      var word = document.createElement("span");
      word.className = "sp-w";
      for (var c = 0; c < words[w].length; c++) {
        var ch = document.createElement("span");
        ch.className = "ch";
        ch.style.setProperty("--i", i++);
        ch.textContent = words[w][c];
        word.appendChild(ch);
      }
      frag.appendChild(word);
    }
    el.textContent = "";
    var hide = document.createElement("span");
    hide.setAttribute("aria-hidden", "true");
    hide.appendChild(frag);
    el.appendChild(hide);
    return true;
  }

  function splitLines(el) {
    var text = el.textContent;
    if (!text) return false;
    el.setAttribute("aria-label", text);
    var words = text.trim().split(/\s+/);
    var probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    var spans = [];
    for (var i = 0; i < words.length; i++) {
      var s = document.createElement("span");
      s.className = "sp-w";
      s.textContent = words[i];
      probe.appendChild(s);
      probe.appendChild(document.createTextNode(" "));
      spans.push(s);
    }
    el.textContent = "";
    el.appendChild(probe);

    // group by vertical position: a new offsetTop means a new line
    var lines = [], current = null, lastTop = null;
    for (var j = 0; j < spans.length; j++) {
      var top = spans[j].offsetTop;
      if (lastTop === null || Math.abs(top - lastTop) > 2) {
        current = []; lines.push(current); lastTop = top;
      }
      current.push(spans[j].textContent);
    }
    if (!lines.length) return false;

    el.textContent = "";
    var holder = document.createElement("span");
    holder.setAttribute("aria-hidden", "true");
    for (var k = 0; k < lines.length; k++) {
      var outer = document.createElement("span");
      outer.className = "ln";
      outer.style.setProperty("--i", k);
      var inner = document.createElement("span");
      inner.className = "ln-i";
      inner.textContent = lines[k].join(" ");
      outer.appendChild(inner);
      holder.appendChild(outer);
    }
    el.appendChild(holder);
    return true;
  }

  /* ============================================================
     Reveal
     ============================================================ */

  function collect() {
    var out = [];
    var seen = [];
    function push(el, mode) {
      if (seen.indexOf(el) !== -1) return;
      seen.push(el);
      out.push({ el: el, mode: mode });
    }
    var explicit = document.querySelectorAll("[data-reveal]");
    for (var i = 0; i < explicit.length; i++) {
      push(explicit[i], attr(explicit[i], "data-reveal") || "rise");
    }
    var legacy = document.querySelectorAll(".reveal");
    for (var j = 0; j < legacy.length; j++) push(legacy[j], "rise");

    // data-reveal-children: the parent declares it, the children get it
    var hosts = document.querySelectorAll("[data-reveal-children]");
    for (var h = 0; h < hosts.length; h++) {
      var kids = hosts[h].children;
      var mode = attr(hosts[h], "data-reveal-children") || "rise";
      for (var k = 0; k < kids.length; k++) push(kids[k], mode);
    }
    return out;
  }

  function initReveal() {
    var items = collect();
    if (!items.length) return;

    if (reduce || !hasIO) {
      // nothing is hidden in the first place, so there is nothing to show
      for (var r = 0; r < items.length; r++) items[r].el.classList.add("in");
      return;
    }

    // split first, while the element is still laid out normally
    for (var s = 0; s < items.length; s++) {
      var it = items[s];
      if (it.mode === "chars") { if (!splitChars(it.el)) it.mode = "rise"; }
      else if (it.mode === "lines") { if (!splitLines(it.el)) it.mode = "rise"; }
      it.el.setAttribute("data-reveal", it.mode);
    }

    // stagger index within the shared parent, so a grid cascades
    var lastParent = null, n = 0;
    for (var t = 0; t < items.length; t++) {
      var el = items[t].el;
      if (el.parentNode !== lastParent) { lastParent = el.parentNode; n = 0; }
      el.style.setProperty("--si", Math.min(n++, 8));
      el.classList.add("pre");
    }

    var ran = false;
    var io = new IntersectionObserver(function (entries, obs) {
      ran = true;
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var e = entries[i].target;
        var extra = parseFloat(attr(e, "data-delay") || "0") * 1000;
        if (extra > 0) {
          (function (node) {
            window.setTimeout(function () {
              node.classList.remove("pre"); node.classList.add("in");
            }, extra);
          })(e);
        } else {
          e.classList.remove("pre"); e.classList.add("in");
        }
        obs.unobserve(e);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });

    for (var o = 0; o < items.length; o++) io.observe(items[o].el);

    /* The -8% bottom rootMargin shrinks the observer's root, which
       leaves a dead zone in the last 8% of the viewport. Anything
       sitting in it once the page is already scrolled as far as it
       goes — typically the footer and the final section — can never
       intersect, and would stay invisible permanently. There is no
       further scroll available to rescue it, so flush what is left
       on reaching the bottom. (reveal.js had the same dead zone; its
       blanket 1600ms timer hid the symptom.)
       Bound to events only: running this at init would defeat the
       reveal on any page shorter than the viewport. */
    function flush() {
      if (window.innerHeight + window.pageYOffset <
          root.scrollHeight - 2) return;
      var left = document.querySelectorAll(".pre");
      for (var i = 0; i < left.length; i++) {
        left[i].classList.remove("pre");
        left[i].classList.add("in");
      }
    }
    window.addEventListener("scroll", flush, { passive: true });
    window.addEventListener("resize", flush, { passive: true });
    window.setTimeout(flush, 400);           // catches a deep link landing at the end

    // Disaster guard only. If the observer never ran at all, something
    // is wrong with the engine and content must not stay hidden. This
    // is NOT the old blanket timer: when the observer works, every
    // element below the fold keeps waiting for its own scroll.
    window.setTimeout(function () { if (!ran) showAll(); }, 3000);
  }

  /* ============================================================
     Parallax — drift while in view. Composite-only (transform),
     written once per frame, and only while something is on screen.
     ============================================================ */

  function initParallax() {
    if (reduce || !hasIO) return;
    var nodes = document.querySelectorAll("[data-parallax]");
    if (!nodes.length) return;

    var live = [], raf = 0;

    function frame() {
      raf = 0;
      var h = window.innerHeight;
      for (var i = 0; i < live.length; i++) {
        var el = live[i];
        var r = el.getBoundingClientRect();
        var mid = (r.top + r.height / 2 - h / 2) / h;      // -0.5 .. 0.5 ish
        var f = parseFloat(attr(el, "data-parallax")) || 0.2;
        el.style.transform = "translate3d(0," + (-mid * f * 100).toFixed(2) + "px,0)";
      }
      if (live.length) raf = window.requestAnimationFrame(frame);
    }

    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var el = entries[i].target, at = live.indexOf(el);
        if (entries[i].isIntersecting && at === -1) live.push(el);
        else if (!entries[i].isIntersecting && at !== -1) {
          live.splice(at, 1);
          el.style.transform = "";
        }
      }
      if (live.length && !raf) raf = window.requestAnimationFrame(frame);
    }, { rootMargin: "20% 0px 20% 0px" });

    for (var n = 0; n < nodes.length; n++) io.observe(nodes[n]);
  }

  /* ============================================================
     Odometer — count to the authored number on first sight.
     The final value is in the HTML, so it is correct with JS off
     and correct for a screen reader at all times.
     ============================================================ */

  function initOdometer() {
    var nodes = document.querySelectorAll("[data-odometer]");
    if (!nodes.length) return;
    if (reduce || !hasIO) return;

    var io = new IntersectionObserver(function (entries, obs) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var el = entries[i].target;
        obs.unobserve(el);
        var target = parseFloat(attr(el, "data-odometer"));
        if (isNaN(target)) continue;
        var suffix = (el.textContent.match(/[^0-9.,\s].*$/) || [""])[0];
        var pad = /^0\d/.test(String(target)) ? 2 : 0;
        (function (node, to, suf, p) {
          var t0 = 0, dur = 900;
          function tick(ts) {
            if (!t0) t0 = ts;
            var k = Math.min((ts - t0) / dur, 1);
            var eased = 1 - Math.pow(1 - k, 3);
            var v = Math.round(to * eased);
            node.textContent = (p ? String(v).padStart(p, "0") : String(v)) + suf;
            if (k < 1) window.requestAnimationFrame(tick);
          }
          window.requestAnimationFrame(tick);
        })(el, target, suffix, pad);
      }
    }, { threshold: 0.4 });

    for (var n = 0; n < nodes.length; n++) io.observe(nodes[n]);
  }

  /* ============================================================
     Accent — the section being read retints the page.

     The reference site swaps the whole palette, light to dark to
     blue to orange. This world is pinned dark, so only the accent
     channel moves: links, rims, the prism edge. The background
     photograph stays exactly as authored.
     ============================================================ */

  function initAccent() {
    if (!hasIO) return;
    var nodes = document.querySelectorAll("[data-accent]");
    if (!nodes.length) return;

    /* Every [data-accent] scopes its own accent, because CSS cannot read
       an attribute value as a colour — the attribute has to be copied
       into a custom property for `color: var(--accent)` to see it. This
       is what lets a project card tint its own rim and label. */
    for (var s = 0; s < nodes.length; s++) {
      var own = attr(nodes[s], "data-accent");
      if (own) nodes[s].style.setProperty("--accent", own);
    }

    /* Only sections drive the page-wide wash. A card retints itself; it
       does not repaint the whole page as it drifts past. */
    var sections = [];
    for (var q = 0; q < nodes.length; q++) {
      if (nodes[q].tagName === "SECTION") sections.push(nodes[q]);
    }
    if (!sections.length) return;
    nodes = sections;

    var base = getComputedStyle(root).getPropertyValue("--accent").trim();
    var current = null;

    // the wash is injected, not authored, so a page with JS off never
    // carries an empty decorative div and no HTML needs editing
    if (!document.querySelector(".accent-wash")) {
      var wash = document.createElement("div");
      wash.className = "accent-wash";
      wash.setAttribute("aria-hidden", "true");
      document.body.insertBefore(wash, document.body.firstChild);
    }

    function apply(el) {
      var a = el ? attr(el, "data-accent") : null;
      if (a === current) return;
      current = a;
      root.style.setProperty("--accent", a || base);
      var pale = el && attr(el, "data-accent-pale");
      if (pale) root.style.setProperty("--accent-pale", pale);
      else root.style.removeProperty("--accent-pale");
    }

    function pick() {
      var line = window.innerHeight * 0.35;
      var best = null, bestTop = -Infinity;
      for (var i = 0; i < nodes.length; i++) {
        var top = nodes[i].getBoundingClientRect().top;
        if (top <= line && top > bestTop) { bestTop = top; best = nodes[i]; }
      }
      apply(best);
    }

    var io = new IntersectionObserver(pick, { rootMargin: "-10% 0px -55% 0px", threshold: 0 });
    for (var n = 0; n < nodes.length; n++) io.observe(nodes[n]);
    pick();
  }

  /* ============================================================ */

  function init() {
    try {
      initReveal();
      initParallax();
      initOdometer();
      initAccent();
    } catch (err) {
      // an engine fault must never leave the page blank
      showAll();
      if (window.console && console.error) console.error("motion.js:", err);
    }
  }

  function start() {
    // line splitting measures text, so wait for the real font
    if (document.fonts && document.fonts.ready && document.querySelector('[data-reveal="lines"]')) {
      document.fonts.ready.then(init, init);
    } else {
      init();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
