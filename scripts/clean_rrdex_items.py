#!/usr/bin/env python3
"""Clean the RR dex repo's item sprites the same way clean_rrdex_sprites.py
cleans species sprites: raw PNGs have no alpha channel, a chroma-key
background bakes in as opaque pixels. Downloads each one, flood-fills the
background (from the image border, so it can't eat into the icon itself),
and writes cleaned copies to public/sprites/items/<id>.png — the app tries
that local path before the (uncleaned) live RR dex repo URL, so items we
haven't processed yet still fall back to the old behavior.

Usage: python3 scripts/clean_rrdex_items.py [id ...]
  With no args, cleans every ID id in ITEM_IDS below. Requires Pillow.
"""

import sys
import urllib.request
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Requires Pillow: pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "sprites" / "items"
RRDEX_ITEMS = (
    "https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex"
    "/master/graphics/items"
)

# item sprite IDs confirmed (via a live PokeAPI HEAD-request sweep of every
# item name in items.json + raid drops) to have no PokeAPI equivalent —
# genuinely RR-custom (mega stones, Z-crystals) or items PokeAPI's static
# sprite set doesn't carry. Re-run the sweep if new items are added and
# pass any newly-broken IDs as argv.
ITEM_IDS = [
    55, 72, 261, 347, 362, 363, 532, 537, 580, 581, 582, 584, 586, 587, 588,
    590, 593, 594, 597, 598, 599, 600, 601, 602, 604, 605, 606, 607, 608,
    610, 611, 613, 614, 615, 621, 622, 623, 625, 641, 725, 728, 729, 730,
    731, 732, 733, 734, 735, 737, 738, 739, 740, 742, 743, 744, 745, 747,
    # TM/HM ground-pickup icons (tm01-tm120, hm01-hm08) actually used by
    # some overworld location's item list
    289, 290, 291, 292, 293, 295, 296, 297, 298, 299, 300, 302, 303, 306,
    307, 310, 311, 313, 314, 315, 316, 317, 318, 319, 320, 322, 324, 325,
    326, 327, 328, 329, 330, 331, 332, 333, 334, 336, 337, 338, 339, 340,
    341, 342, 343, 344, 345, 376, 377, 379, 380, 382, 383, 384, 385, 386,
    387, 388, 391, 392, 393, 394, 395, 396, 397, 398, 401, 402, 403, 405,
    406, 410, 411, 414, 415, 417, 419, 420, 421, 422, 423, 424, 425, 426,
    428, 429, 430, 431, 434, 437, 439, 440, 441, 442, 444, 445,
]


def clean_background(im: Image.Image) -> Image.Image:
    """Flood-fill from the border: any pixel connected to the edge through
    a chain of near-identical colors gets erased into transparency."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    seed = px[0, 0][:3]
    tol = 4

    def close(c):
        return all(abs(c[i] - seed[i]) <= tol for i in range(3))

    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or x >= w or y < 0 or y >= h or seen[y][x]:
            continue
        seen[y][x] = True
        r, g, b, a = px[x, y]
        if not close((r, g, b)):
            continue
        px[x, y] = (r, g, b, 0)
        q.append((x - 1, y))
        q.append((x + 1, y))
        q.append((x, y - 1))
        q.append((x, y + 1))

    return rgba


def main():
    ids = [int(a) for a in sys.argv[1:]] or ITEM_IDS
    print(f"{len(ids)} item sprites to clean")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = fail = 0
    for iid in ids:
        out_path = OUT_DIR / f"{iid}.png"
        raw_path = out_path.with_suffix(".raw.png")
        url = f"{RRDEX_ITEMS}/{iid}.png"
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                raw_path.write_bytes(resp.read())
        except Exception as e:
            print(f"  SKIP {iid}: download failed — {e}")
            fail += 1
            continue
        try:
            im = Image.open(raw_path)
            cleaned = clean_background(im)
            cleaned.save(out_path)
            ok += 1
        except Exception as e:
            print(f"  SKIP {iid}: processing failed — {e}")
            fail += 1
        finally:
            raw_path.unlink(missing_ok=True)

    print(f"done: {ok} cleaned, {fail} failed -> {OUT_DIR}")


if __name__ == "__main__":
    main()
