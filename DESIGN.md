# DESIGN.md — Liquid Glass, revamp v1

The committed visual world is **Liquid Glass**: a dark, photographic background
seen through frosted panels with refractive edge volume. The revamp changes
*structure, typography and reading flow* inside that world. It does not replace it.

## Pinned decisions

These are the owner's calls. They override generic design guidance, including
rules that would normally forbid them. Do not "fix" them.

| Decision | Status |
|---|---|
| **Blue gradient wordmark** (`.logo .l-d`, `.logo.brand .l-d`) | **Pinned. Keep.** Generic guidance bans gradient-filled text; the owner wants it and it is the brand mark. |
| Dark photographic background, blue accent family | Pinned. A space/particle gradient background is planned; palette stays. |
| Glass panels with refractive rim | Pinned. Rationed, not removed — see Prism. |
| No build step | Hard constraint. Plain HTML/CSS/JS, editable by uploading to GitHub. |

## Type scale

Previously the site had two effective sizes and ran its weights backwards:
display at 200, every reading role at 300, and `.doc-section > h2` at 0.74rem —
smaller and fainter than the paragraphs beneath it. The scale below fixes that.

| Token | Role |
|---|---|
| `--step--1` | captions, meta, labels |
| `--step-0` | body |
| `--step-1` | card titles, lead-ins |
| `--step-2` | section headings |
| `--step-3` | page titles |
| `--step-4` | hero display |

Weights are named by job: `--w-body: 400`, `--w-head: 500`, `--w-display: 300`,
`--w-label: 500`. Body moved 300 → 400 because light text on a dark photographic
surface needs more weight, not less. Display moved 200 → 300 for the same reason.

Prose is capped at `--measure` (68ch). It was running 83ch in `.container` and
~118ch in `.container.wide`.

## The rail

Content left, media right, scroll-synced. The centerpiece of the revamp.

### Authoring contract

`data-media` on a content block matches `id` on a figure. Add a pair, commit, done.

```html
<div class="rail">
  <div class="rail-text">
    <section class="doc-section" data-media="m2">…</section>
  </div>
  <aside class="rail-media" aria-label="Figures">
    <figure id="m2"><img src="…" alt="…"><figcaption>…</figcaption></figure>
  </aside>
</div>
```

### Behaviour

Two states:

- **SYNCED** (default) — an IntersectionObserver on `[data-media]` activates the
  block crossing mid-viewport; the media pane scrolls to its figure and holds.
- **BROWSING** — entered when the pane receives `wheel` / `touchstart` /
  `pointerdown` / navigation keys. The text observer keeps running but no longer
  moves the pane. A resync chip appears.

Return to SYNCED on the next wheel/touch over the document outside the pane, or
by clicking the chip.

**State transitions listen for intent, never for `scroll`.** Programmatic scrolls
emit `scroll` events indistinguishable from user scrolls; that is where this
pattern normally breaks. No `scroll` listener means no guard flags and no race.

### Responsive

- **≥1024px** — two columns, `minmax(0, 560px) minmax(0, 1fr)`. Media pane is
  sticky, full height, independently scrollable.
- **<1024px** — pane becomes a sticky bottom bar at `25dvh`, a horizontally
  scroll-snapping strip, collapsible by a handle. Collapsed state is remembered
  per-viewer in `localStorage` (wrapped in try/catch).

### Degradation

No JS: the rail is a plain grid and the pane scrolls on its own. Nothing is
hidden by CSS. This matches the existing no-blank-page discipline in `reveal.js`.

### Where it goes

Fits: project documentation pages, blog posts. Fits with reshaping: `portfolio/`.
Does **not** fit the landing page or the `projects` / `blog` index pages — they
are menus with no prose to sync against. They get the type and grid fixes only.

## Prism

Chromatic aberration on the glass edge: three channel-offset rims composited with
`mix-blend-mode: plus-lighter`, magenta → cyan → blue, so the resting state stays
in the site's blue. `--prism-a` is driven by the pointer data `ui.js` already
feeds to cards, so the dispersion rotates as the cursor moves.

**Rationed deliberately.** `plus-lighter` composites on top of
`backdrop-filter: blur(26px) saturate(155%)`. CatBot already renders ~14 blurred
surfaces over a fixed full-bleed photo, which is a scroll-jank risk on mid-range
Android. The prism goes on the hero frame, the active rail figure, and primary
buttons. Nothing else.

## Known defects being fixed

- `.cap` was never defined in `theme.css`. `catbot/` defined it page-scoped;
  `flexnode/` did not, so its captions rendered at browser default — 1rem pure
  white, louder than the prose. Now a real primitive in the system.
- `projects/catbot/` defines 12 section ids and nothing links to any of them.
- No layout breakpoint above 560px existed; everything was `repeat(auto-fit, …)`.

---

# Blend layer v2

Architecture borrowed from a reference portfolio (Astro + Lenis + GSAP
ScrollTrigger/Observer, 162KB of JS, one page, four palettes) and translated
into this world. **What was borrowed is the architecture, not the look.**

Not borrowed, and never to be: its paper/ink/orange palette, its typefaces
(Bricolage Grotesque, JetBrains Mono, Mr Dafoe), Lenis, Astro, or a build step.
The dark photographic world and the blue gradient wordmark stay pinned.

## What the comparison actually showed

Measured at 1440×900, before any of this:

| | Reference | Here |
|---|---|---|
| Home page | 4433px, 4.9 screens | 901px, **1.0 screen** |
| h1 | 248px / w800 | 48px / w300 |
| **display : body** | **17 : 1** | **3.1 : 1** |
| Width | full-bleed, fluid gutter | fixed 720 / 1000px |
| Backdrop-filter surfaces | 0 | 4 / 26 / 11 |

The ratio is the finding. Nothing here was ever much bigger than anything
else, so no scroll position felt like an arrival. `--step-5` and the full-bleed
ground exist to fix that; display:body is now ~10.8:1.

## The motion contract

Every behaviour is an attribute read by `assets/motion.js`. A new page is
authored by writing attributes — no JavaScript, no build, which is what keeps
the "editable by uploading to GitHub" constraint true.

| Attribute | On | Does |
|---|---|---|
| `data-reveal="fade\|rise\|chars\|lines"` | anything | how it enters |
| `data-reveal-children="rise"` | a container | staggers its direct children |
| `data-delay="0.2"` | anything revealing | extra delay, seconds |
| `data-parallax="0.25"` | anything | drift while in view |
| `data-odometer="21"` | a number | counts up on first sight |
| `data-accent="#58d7c8"` | `<body>` / `<section>` / a card | see below |

`.reveal` remains a synonym for `data-reveal="rise"`; thirteen pages use it and
none needed editing.

**Accent has three scopes.** On `<body>` it is the page default — this is how a
project page carries the same identity colour its card has on the landing page.
On a `<section>` it additionally drives the page wash as that section is read.
On anything else it scopes only that element's own `--accent`.

`--blue-*` is **never** touched by any of this. The reference site tweens the
whole body between palettes; here the brand blue is pinned, so the accent gets
its own channel instead — a low ambient wash (`.accent-wash`, injected by JS)
over the background photograph. Same mechanic, nothing pinned is disturbed.
`@property --accent` is what makes it animatable; engines without it cut
instead of tweening, which is an acceptable degrade.

## The set piece

`assets/stage.js`, on the landing page. One discipline holds the viewport per
screen of scroll, with a counter, an index rail, a per-character cascade and a
ring that draws itself in.

**Built on `position: sticky`, not GSAP.** The reference site needs
ScrollTrigger because Lenis owns its scroll and must be bridged through
`scrollerProxy`. Native scrolling was the choice here, and native sticky pins
correctly with no spacer and no layout shift. What remained was arithmetic:
how far through the track are we. That is the whole file. Importing ~70KB onto
the first page a visitor loads to do this is a bad trade — if a later set piece
genuinely needs timeline choreography, add GSAP *there*, on that page only.

Adding a sixth discipline is a `.stage-word`, a `.stage-note` and an
`.stage-index` item. `stage.js` sizes the track from the word count, so the
scroll distance follows automatically.

## Traps found by rendering it

Each of these passed a plausible-looking check and was caught only by looking:

- **`.h-sec` vs `.doc-section > h2`.** The revamp styled only the latter. They
  are the same role; the older pages just use the other class. Result: eleven
  of sixteen pages kept 27px w200 headings and the site read as untouched.
  *A selector that matches "the pages I was looking at" is not a system.*
- **`margin` shorthand silently cancels `.bleed`.** `.stage { margin: X 0 }`
  resets margin-left/right to 0, overriding `.bleed`'s `calc(50% - 50vw)` at
  equal specificity. The full-bleed section was inset 118px and clipped its
  last index item. Use `margin-block`.
- **`overflow-x: hidden` kills `position: sticky`** by making the element a
  scroll container. `clip` does not. The full-bleed ground needs one of them;
  it must be `clip` or the rail's media pane silently stops sticking.
- **CSS cannot read an attribute as a colour.** `data-accent` on a card did
  nothing until `motion.js` copied it into a scoped custom property.
- **A negative bottom `rootMargin` creates a dead zone.** Anything in the last
  8% of the viewport once the page is scrolled as far as it goes can never
  intersect. `reveal.js` had this too; its blanket 1600ms timer hid it.

## Retired

`assets/reveal.js` — replaced by `motion.js`. It showed every remaining element
on a 1600ms timer, so on a long page the scroll reveal only worked for the first
1.6 seconds. Measured on `/portfolio/`: 18 of 25 elements revealed unseen.

## Still open

- `/portfolio/` first viewport: a 138px headshot, five buttons and eight
  evidence-free skill tiles, with the first robot photo ~1290px down. It has
  the new type scale but not the new structure.
- `/projects/` and `/blog/` index pages: type and grid only so far.
- `cardqr/` overflows 34px on a phone. It loads none of the shared CSS or JS,
  so it is isolated — and untouched by any of this.
- The rail breakpoint is 1024px, where the media pane is only 384px. ~1180
  would be a better threshold.
