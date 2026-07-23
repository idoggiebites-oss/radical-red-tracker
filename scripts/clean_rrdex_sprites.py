#!/usr/bin/env python3
"""Clean the RR dex repo's custom-form sprites (custom Megas, Sevii forms).

Those PNGs are exported with the ripping tool's chroma-key background baked
in as opaque pixels (no alpha/tRNS chunk at all) instead of real
transparency, so they render as a solid green/pink box in the app. This
downloads each one, flood-fills the background (starting from the image
border, so it can't eat into the sprite itself) into real alpha, and writes
cleaned copies to public/sprites/custom/<dexID>.png — src/lib/sprites.ts
tries that local path before the (uncleaned) live RR dex repo URL, so
species we haven't processed yet still fall back to the old behavior.

Usage: python3 scripts/clean_rrdex_sprites.py
Requires Pillow (pip install pillow) — not needed for the main app/build.
"""

import json
import sys
import urllib.request
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Requires Pillow: pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
TYPES_JSON = ROOT / "src" / "data" / "types.json"
OUT_DIR = ROOT / "public" / "sprites" / "custom"
RRDEX_SPECIES = (
    "https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex"
    "/master/graphics/species/front"
)

# must mirror CANON_MEGA in src/lib/sprites.ts: species with an official
# Showdown-hosted mega sprite — any other "-Mega" is an RR custom
CANON_MEGA = {
    "venusaur", "charizard", "blastoise", "beedrill", "pidgeot", "alakazam",
    "slowbro", "gengar", "kangaskhan", "pinsir", "gyarados", "aerodactyl",
    "mewtwo", "ampharos", "steelix", "scizor", "heracross", "houndoom",
    "tyranitar", "sceptile", "blaziken", "swampert", "gardevoir", "sableye",
    "mawile", "aggron", "medicham", "manectric", "sharpedo", "camerupt",
    "altaria", "banette", "absol", "glalie", "salamence", "metagross",
    "latias", "latios", "rayquaza", "lopunny", "garchomp", "lucario",
    "abomasnow", "gallade", "audino", "diancie",
}


# not Sevii/Mega, but confirmed (curl) to 404 on Showdown under every
# slug spriteUrls() tries — genuinely only available from the RR dex
NOT_ON_SHOWDOWN = {
    "Pikachu-Flying", "Pikachu-Surfing",
    "Basculin-Blue-Striped", "Centiskorch-MegaS", "Dialga-Primal",
    "Wishiwashi-S-Sch",
}


def is_custom_form(species: str) -> bool:
    if species in NOT_ON_SHOWDOWN:
        return True
    if species.endswith("-Sevii"):
        return True
    if species.endswith("-Mega"):
        return species[: -len("-Mega")].lower() not in CANON_MEGA
    return False


def clean_background(im: Image.Image) -> Image.Image:
    """Flood-fill from the border: any pixel connected to the edge through
    a chain of near-identical colors gets erased into transparency. A real
    sprite pixel of a similar color deeper inside (not border-connected)
    is left alone."""
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
    with open(TYPES_JSON) as f:
        data = json.load(f)
    sprite_ids = data["spriteIds"]

    targets = {name: sid for name, sid in sprite_ids.items() if is_custom_form(name)}
    print(f"{len(targets)} custom-form species to clean")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = fail = 0
    for name, sid in sorted(targets.items(), key=lambda kv: kv[1]):
        out_path = OUT_DIR / f"{sid}.png"
        raw_path = out_path.with_suffix(".raw.png")
        url = f"{RRDEX_SPECIES}/{sid}.png"
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                raw_path.write_bytes(resp.read())
        except Exception as e:
            print(f"  SKIP {name} ({sid}): download failed — {e}")
            fail += 1
            continue
        try:
            im = Image.open(raw_path)
            cleaned = clean_background(im)
            cleaned.save(out_path)
            ok += 1
        except Exception as e:
            print(f"  SKIP {name} ({sid}): processing failed — {e}")
            fail += 1
        finally:
            raw_path.unlink(missing_ok=True)

    print(f"done: {ok} cleaned, {fail} failed -> {OUT_DIR}")


if __name__ == "__main__":
    main()
