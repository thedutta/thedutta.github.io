"""
Build Splitbaby profile avatars.

Reads any image dropped in the inbox directory, named after a person
("Dutta.png", "vagmi.jpg", "Atharv Tyagi.png" ...), centre-crops it to a
square WITHOUT distorting the aspect ratio, resizes to 480x480 and writes
splitbaby/avatars/<id>.jpg.

Then rewrites the PHOTOS list in config.js so the app only asks for faces
that actually exist.
"""

import io
import os
import re
import sys

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))

# default inbox: drop photos here, named after the person
INBOX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO_ROOT, "b603splitbaby", "DPs")
REPO = REPO_ROOT
SB = os.path.join(REPO, "splitbaby")
OUT = os.path.join(SB, "avatars")
SIZE = 480

# id -> the names that should map to it
PEOPLE = {
    "atharv": ["atharv", "atharvtyagi"],
    "dutta":  ["dutta", "aditya", "adityadutta"],
    "nikhil": ["nikhil"],
    "zaid":   ["zaid", "zaidkhan"],
    "jap":    ["jap", "japneet", "japneetk"],
    "vagmi":  ["vagmi", "vagmijain"],
    "aryan":  ["aryan", "aryanjha"],
    "kunsh":  ["kunsh", "kunshmehra", "kunshmhra"],
    "vidip":  ["vidip", "vidipgaur", "gaurvidip"],
    "vidu":   ["vidu", "vidugaur"],
    "dipen":  ["dipen", "sdipen"],
}

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".heic", ".bmp"}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def match_id(stem):
    n = norm(stem)
    if not n:
        return None
    for pid, aliases in PEOPLE.items():
        if n in (norm(a) for a in aliases):
            return pid
    # fall back to a prefix match so "dutta-1" or "zaid new" still land
    for pid, aliases in PEOPLE.items():
        for a in aliases:
            if n.startswith(norm(a)):
                return pid
    return None


def square(im):
    """Centre-crop to a square, then resize. Never warps the picture."""
    im = ImageOps.exif_transpose(im)          # honour the phone's rotation flag
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    elif im.mode == "L":
        im = im.convert("RGB")

    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    # faces sit above centre far more often than below, so bias the crop up
    if h > w:
        top = max(0, int((h - side) * 0.38))
    im = im.crop((left, top, left + side, top + side))
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.isdir(INBOX):
        print("inbox not found:", INBOX)
        return

    found, skipped = {}, []
    for fn in sorted(os.listdir(INBOX)):
        stem, ext = os.path.splitext(fn)
        if ext.lower() not in EXTS:
            continue
        pid = match_id(stem)
        if not pid:
            skipped.append(fn)
            continue
        src = os.path.join(INBOX, fn)
        try:
            with Image.open(src) as im:
                orig = im.size
                out = square(im)
        except Exception as e:                       # noqa: BLE001
            skipped.append(fn + " (" + str(e) + ")")
            continue
        dst = os.path.join(OUT, pid + ".jpg")
        out.save(dst, "JPEG", quality=86, optimize=True, progressive=True)
        found[pid] = (fn, orig, os.path.getsize(dst))

    # keep any avatar already on disk from a previous run
    have = sorted(
        f[:-4] for f in os.listdir(OUT)
        if f.endswith(".jpg") and f[:-4] in PEOPLE
    )

    cfg = os.path.join(SB, "config.js")
    s = io.open(cfg, encoding="utf-8").read()
    listing = ", ".join('"%s"' % p for p in have)
    new = "export const PHOTOS = [%s];" % listing
    s2 = re.sub(r"export const PHOTOS = \[[^\]]*\];", new, s, count=1)
    if s2 != s:
        io.open(cfg, "w", encoding="utf-8").write(s2)

    for pid in sorted(found):
        fn, orig, size = found[pid]
        print("  %-8s <- %-28s %sx%s -> 480x480  %.0f KB" % (pid, fn, orig[0], orig[1], size / 1024))
    if skipped:
        print("  skipped (no name match):", ", ".join(skipped))
    print("\nPHOTOS = [%s]  (%d of %d)" % (listing, len(have), len(PEOPLE)))
    missing = [p for p in PEOPLE if p not in have]
    if missing:
        print("still using initials:", ", ".join(sorted(missing)))


if __name__ == "__main__":
    main()
