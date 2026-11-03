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
