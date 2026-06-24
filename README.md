# thedutta.github.io

Aditya Dutta — personal portfolio, project documentation and blog. Static, no build step (plain HTML/CSS/JS, drop-in deploy to GitHub Pages).

## Structure

```
/                       Landing hub — wordmark + 3 doors (Portfolio / Projects / Blog)
/portfolio/             The PDF as a site: bio, skills, tools, flagship work + download button
/portfolio/PortfolioDutta.pdf
/projects/              Project index
/projects/catbot/       CatBot — autonomous quadruped (doc)
/projects/sylvara/      Sylvara — ultra-low-power plant-care startup (doc)
/projects/rovolt/       RoVolt — WHEG agri robot (doc)
/blog/                  Blog index
/blog/energy-first-sylvara/   Sample post (copy as a template for new posts)
/radar/                 RADAR Robotics Lab proposal (rebuilt in the glass theme)
/CSEA/                  Academic hub (reskinned to the glass theme)
```

## Shared assets (`/assets/`)

- `theme.css` — "Liquid Glass" design system: self-hosted Geist font, responsive
  photographic background, glass cards with refractive edge volume, and the
  portfolio components (nav, hero, skills, project cards, doc layout, blog).
- `reveal.js` — staggered reveal-on-scroll (fails open: content always shown).
- `ui.js` — cursor spotlight + tap ripple (progressive enhancement).
- `fonts/` — Geist woff2 (200–700), self-hosted so it loads for everyone.
- `bg/` — responsive background variants (webp + jpg, 400–2400w).
- `img/` — project images, extracted from the portfolio and web-optimised.

## Adding a blog post

Copy `/blog/energy-first-sylvara/index.html` into a new `/blog/<slug>/` folder,
edit the `<article>` content, then add a `.post-row` card to `/blog/index.html`.

## Notes

- `/radar/` is the RADAR Robotics Lab proposal, rebuilt in the glass theme from the
  original (images optimised into `/radar/img/`); linked from the projects page.
- `DoorThing/` is an older standalone page, intentionally left as-is and unlinked.
- The stale `bagtag/` folder and the `radar/rc` configurator were removed.
- No secrets in this repo — it is public and world-readable.
