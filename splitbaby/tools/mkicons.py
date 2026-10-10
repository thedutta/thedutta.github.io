"""
Build the Splitbaby home-screen icons.

Matches the site rather than inventing a style: the near-black
background from theme.css, the same blue-to-white gradient the
wordmark uses (--blue-bright -> --blue-pale -> #eaf2ff at 135 deg),
the self-hosted Geist typeface, and the thin specular top edge that
every glass card in the theme carries.

    python splitbaby/tools/mkicons.py
"""

import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SB = os.path.dirname(HERE)
REPO = os.path.dirname(SB)
OUT = os.path.join(SB, "icons")
FONT_WOFF2 = os.path.join(REPO, "assets", "fonts", "geist-600.woff2")

# straight out of assets/theme.css
BG = (5, 5, 6)
BLUE_BRIGHT = (74, 163, 255)
BLUE_PALE = (169, 204, 255)
NEAR_WHITE = (234, 242, 255)
BLUE_DEEP = (11, 92, 255)

SS = 4  # supersample


def geist(size):
    """Unpack the site's own woff2 so the icon and the page share a typeface."""
    try:
        from fontTools.ttLib import TTFont
        f = TTFont(FONT_WOFF2)
        buf = io.BytesIO()
        f.flavor = None
        f.save(buf)
        buf.seek(0)
        return ImageFont.truetype(buf, size)
    except Exception as e:                                   # noqa: BLE001
        print("  (geist unavailable, falling back to Segoe UI: %s)" % e)
        return ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", size)


def bloom(size):
    """The radial scrim from theme.css: light gathers at the top."""
    img = Image.new("RGB", (size, size), BG)
    px = img.load()
    cx, cy, r = size * 0.5, size * 0.04, size * 1.05
    for y in range(size):
        for x in range(size):
            d = (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / r
            t = max(0.0, 1.0 - d) ** 2.6 * 0.34
            px[x, y] = (
                int(BG[0] + (BLUE_DEEP[0] - BG[0]) * t),
                int(BG[1] + (BLUE_DEEP[1] - BG[1]) * t),
                int(BG[2] + (BLUE_DEEP[2] - BG[2]) * t),
            )
    return img


def diagonal_gradient(size):
    """135 degrees: blue-bright -> blue-pale -> near-white, as the wordmark."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / size * 0.5) + (y / size * 0.5)
            if t < 0.52:
                u = t / 0.52
                a, b = BLUE_BRIGHT, BLUE_PALE
            else:
                u = (t - 0.52) / 0.48
                a, b = BLUE_PALE, NEAR_WHITE
            px[x, y] = (
                int(a[0] + (b[0] - a[0]) * u),
                int(a[1] + (b[1] - a[1]) * u),
                int(a[2] + (b[2] - a[2]) * u),
            )
    return img


def icon(size, label, maskable=False):
    S = size * SS
    base = bloom(128).resize((S, S), Image.LANCZOS)

    # maskable icons must keep everything inside the safe circle
    inset = S * 0.19 if maskable else 0
    radius = S * (0.16 if maskable else 0.235)
    box = [inset, inset, S - inset - 1, S - inset - 1]
    inner = box[2] - box[0]

    card = Image.new("RGB", (S, S), BG)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    card.paste(base, (0, 0), mask)

    # the wordmark, painted through a text mask so it carries the gradient
    font = geist(int(inner * 0.255))
    d = ImageDraw.Draw(card)
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2

    text_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(text_mask).text((cx, cy), label, font=font, fill=255, anchor="mm")
    card.paste(diagonal_gradient(S), (0, 0), text_mask)

    # the specular top edge every glass surface in the theme has
    edge = Image.new("L", (S, S), 0)
    ed = ImageDraw.Draw(edge)
    ed.rounded_rectangle(box, radius=radius, outline=255, width=max(2, int(S * 0.006)))
    top_only = Image.new("L", (S, S), 0)
    ImageDraw.Draw(top_only).rectangle([0, 0, S, S * 0.52], fill=255)
    edge = Image.composite(edge, Image.new("L", (S, S), 0), top_only)
    edge = edge.filter(ImageFilter.GaussianBlur(S * 0.004))
    card.paste(Image.new("RGB", (S, S), (255, 255, 255)), (0, 0), edge.point(lambda v: int(v * 0.30)))

    # and the faint full rim that keeps the shape legible on any wallpaper
    rim = Image.new("L", (S, S), 0)
    ImageDraw.Draw(rim).rounded_rectangle(box, radius=radius, outline=255, width=max(1, int(S * 0.0035)))
    card.paste(Image.new("RGB", (S, S), (150, 180, 225)), (0, 0), rim.point(lambda v: int(v * 0.16)))

    out = Image.new("RGB", (S, S), BG)
    out.paste(card, (0, 0), mask if not maskable else Image.new("L", (S, S), 255))
    return out.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for flat in ("b002", "b603"):
        L = flat.upper()
        for sz in (192, 512):
            p = os.path.join(OUT, "%s-%d.png" % (flat, sz))
            icon(sz, L).save(p, optimize=True)
            made.append(p)
        p = os.path.join(OUT, "%s-maskable-512.png" % flat)
        icon(512, L, maskable=True).save(p, optimize=True)
        made.append(p)
        p = os.path.join(OUT, "%s-apple-180.png" % flat)
        icon(180, L).save(p, optimize=True)
        made.append(p)

    for p in made:
        print("  %-26s %5.0f KB" % (os.path.basename(p), os.path.getsize(p) / 1024))


if __name__ == "__main__":
    main()
