#!/usr/bin/env python3
"""Import Radical Red 4.1 data from the official Google Sheets docs into JSON.

Sources (official community docs for Radical Red 4.1):
  - Pokemon Locations & Raid Dens v4.1
  - Default Mode Bosses v4.1 (with EVs)
  - Restricted/Hardcore Mode Info & Hardcore Bosses v4.1

Usage:  python3 scripts/import_data.py [--refresh]
  Downloads each tab as CSV (cached in scripts/cache/), parses it and writes
  src/data/encounters.json and src/data/bosses.json.
  --refresh re-downloads even if a cached copy exists.
"""

import ast
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache"
OUT = ROOT / "src" / "data"

ENCOUNTERS_SHEET = "15mUFUcN8250hRL7iUOJPX0s1rMcgVuJPuHANioL4o2o"
DEFAULT_BOSSES_SHEET = "1ES8L4OzeJ8rCuMWFNvrDaZKArqR7Vys2ytFxjx2pbwE"
HARDCORE_BOSSES_SHEET = "1jDbKFA30xo8csPHZNLtsmqs781bW_Xb9mKoPYyE6KK8"

ENCOUNTER_TABS = {
    "grass": 0,
    "fishing": 955089917,
    "fossils": 1177205447,
    "safari": 2109178889,
    "statics": 241244610,
    "egg_vendor": 806620788,
    "trades": 952974556,
    "gifts": 1585451773,
    "raids": 841196022,
}

BOSS_TABS = {
    "Trainer Order": 306634858,
    "Kanto Leaders": 1410111071,
    "Kanto Rematch": 2075653688,
    "Johto Leaders": 2145471124,
    "Rivals": 1150799580,
    "Team Rocket": 1998272076,
    "Mini Bosses": 1752505021,
    "Optional Bosses": 739017967,
    "Indigo League": 1411568458,
    "Postgame": 2140479091,
}

ITEMS_SHEET = "16vBrWJDrsw5QsZyiJjD8ACH7079ZCkQ5BaPtioJOPTk"
TMS_TAB_GID = 1578171509
OVERWORLD_ITEMS_GID = 686903232
MEGA_STONES_GID = 1707151972
Z_CRYSTALS_GID = 2085230210

STAT_LABELS = {"HP", "ATK", "DEF", "SPA", "SPD", "SPE"}
NON_SPECIES = STAT_LABELS | {"BASE STATS", "SPEED STAT:", "EVs"}

warnings: list[str] = []


def warn(msg: str) -> None:
    warnings.append(msg)
    print(f"  WARN: {msg}")


def fetch_csv(sheet_id: str, gid: int, name: str, refresh: bool) -> list[list[str]]:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.csv"
    if refresh or not path.exists():
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
        print(f"  downloading {name} ...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode("utf-8")
        path.write_text(data)
    rows = list(csv.reader(io.StringIO(path.read_text())))
    return rows


def cell(rows: list[list[str]], r: int, c: int) -> str:
    if 0 <= r < len(rows) and 0 <= c < len(rows[r]):
        return rows[r][c].strip()
    return ""


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# ---------------------------------------------------------------- encounters

def parse_wide_tables(rows: list[list[str]]):
    """Find every 'Rarity' header cell. Yields (header_row, rarity_col).

    Each such cell heads a 12-slot encounter table: location name is at
    (header_row-1, col+1), entries below at (col, col+2, col+3).
    """
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            if v.strip() == "Rarity":
                yield r, c


def read_slots(rows, header_row, c):
    slots = []
    r = header_row + 1
    while True:
        rarity = cell(rows, r, c)
        species = cell(rows, r, c + 2)
        if not rarity and not species:
            break
        if species:
            slots.append({
                "species": species,
                "rarity": rarity,
                "levels": cell(rows, r, c + 3),
            })
        r += 1
    return slots


def dedupe_slots(slots):
    """Collapse duplicate slots (same species+levels), summing rarity."""
    merged: dict[tuple, dict] = {}
    order = []
    for s in slots:
        key = (s["species"], s["levels"])
        if key in merged:
            a, b = merged[key]["rarity"], s["rarity"]
            try:
                merged[key]["rarity"] = f"{int(a.rstrip('%')) + int(b.rstrip('%'))}%"
            except ValueError:
                pass
        else:
            merged[key] = dict(s)
            order.append(key)
    return [merged[k] for k in order]


def parse_grass(rows):
    """Grass & Caves tab: two stacked table bands, day then night."""
    # group header rows: each band has one row of 'Rarity' cells
    bands: dict[int, list[int]] = {}
    for r, c in parse_wide_tables(rows):
        bands.setdefault(r, []).append(c)
    band_rows = sorted(bands)
    if len(band_rows) != 2:
        warn(f"grass: expected 2 bands (day/night), found {len(band_rows)}")
    # postgame marker column in the location-name row
    post_col = None
    for r in band_rows:
        for c, v in enumerate(rows[r - 1]):
            if "P  O  S  T" in v:
                post_col = c
    locations: dict[str, dict] = {}
    order: list[str] = []
    for band_i, r in enumerate(band_rows):
        time_key = "day" if band_i == 0 else "night"
        for c in bands[r]:
            name = cell(rows, r - 1, c + 1)
            if not name:
                warn(f"grass: no location name above Rarity col {c}")
                continue
            loc = locations.setdefault(name, {"name": name, "postgame": False, "methods": {}})
            if name not in order:
                order.append(name)
            if post_col is not None and c > post_col:
                loc["postgame"] = True
            loc["methods"][f"grass_{time_key}"] = dedupe_slots(read_slots(rows, r, c))
    return [locations[n] for n in order]


FISHING_METHODS = {
    "OLD ROD": "old_rod",
    "GOOD ROD": "good_rod",
    "SUPER ROD": "super_rod",
    "SURFING": "surfing",
}


def parse_fishing(rows):
    """Fishing & Surfing tab: bands per method, method label at col 3 of the
    location-name row."""
    out: dict[str, dict[str, list]] = {}
    order: list[str] = []
    for r, c in parse_wide_tables(rows):
        method_label = cell(rows, r - 1, 3)
        method = FISHING_METHODS.get(method_label)
        if method is None:
            warn(f"fishing: unknown method {method_label!r} at row {r}")
            continue
        name = cell(rows, r - 1, c + 1)
        if not name:
            continue
        out.setdefault(name, {})[method] = dedupe_slots(read_slots(rows, r, c))
        if name not in order:
            order.append(name)
    return out, order


SAFARI_METHODS = {
    "DAY TIME": "grass_day",
    "NIGHT TIME": "grass_night",
    "OLD ROD": "old_rod",
    "GOOD ROD": "good_rod",
    "SUPER ROD": "super_rod",
    "SURFING": "surfing",
}


def parse_safari(rows):
    zones = []
    current = None
    handled = set()
    # zone header: a lone cell in col 2 like 'CENTER (ZONE 1)'
    for r in range(len(rows)):
        v = cell(rows, r, 2)
        if v and "ZONE" in v and cell(rows, r, 3) == "":
            current = {"name": f"SAFARI {v}", "methods": {}}
            zones.append((r, current))
    for r, c in parse_wide_tables(rows):
        zone = None
        for zr, z in zones:
            if zr < r:
                zone = z
        if zone is None:
            warn(f"safari: table at row {r} has no zone header")
            continue
        label = cell(rows, r - 1, c + 1)
        method = SAFARI_METHODS.get(label)
        if method is None:
            warn(f"safari: unknown method {label!r} at row {r} col {c}")
            continue
        key = (id(zone), method)
        if key in handled:
            continue
        handled.add(key)
        zone["methods"][method] = dedupe_slots(read_slots(rows, r, c))
    return [z for _, z in zones]


def parse_statics(rows):
    out = []
    for r in range(len(rows)):
        species = cell(rows, r, 3)
        info = cell(rows, r, 5)
        if species and species != "POKEMON":
            out.append({"species": species, "info": info})
    return out


def parse_gifts(rows):
    out = []
    section = None
    for r in range(len(rows)):
        header = cell(rows, r, 2)
        if header and header != "POKEMON" and not cell(rows, r, 3):
            section = header
            continue
        species = cell(rows, r, 3)
        if species:
            out.append({
                "location": section or "?",
                "species": species,
                "requirements": cell(rows, r, 4),
                "info": cell(rows, r, 8),
            })
    return out


def parse_trades(rows):
    out = []
    for r in range(len(rows)):
        for c in (2, 8):
            v = cell(rows, r, c)
            if v == "Looking for...":
                loc = cell(rows, r - 1, c)
                rr = r + 1
                while True:
                    give = cell(rows, rr, c)
                    reward = cell(rows, rr, c + 3) or cell(rows, rr, c + 4)
                    if not give:
                        break
                    out.append({"location": loc, "give": give, "receive": reward})
                    rr += 1
    return out


def parse_label_columns(rows, label_row, labels):
    """Generic: species listed under each label cell of `label_row`."""
    out = {}
    for c, v in enumerate(rows[label_row]):
        v = v.strip()
        if v in labels:
            species = []
            for r in range(label_row + 1, len(rows)):
                s = cell(rows, r, c) or cell(rows, r, c + 1)
                if not s:
                    if species:
                        break
                    continue
                species.append(s)
            out[v] = species
    return out


def parse_fossils(rows):
    labels = {"GREEN SHARD", "BLUE SHARD", "RED SHARD", "YELLOW SHARD",
              "MT. MOON", "PEWTER MUSEUM"}
    for r in range(len(rows)):
        found = {v.strip() for v in rows[r]} & labels
        if found:
            return parse_label_columns(rows, r, labels)
    warn("fossils: label row not found")
    return {}


def parse_egg_vendor(rows):
    labels = {"GREEN SHARD", "BLUE SHARD", "RED SHARD", "YELLOW SHARD"}
    for r in range(len(rows)):
        found = {v.strip() for v in rows[r]} & labels
        if found:
            return parse_label_columns(rows, r, labels)
    warn("egg vendor: label row not found")
    return {}


# FireRed / Radical Red natural game progression. Locations not listed keep
# their sheet order after these; the importer warns so the list stays complete.
LOCATION_ORDER = [
    "PALLET TOWN",
    "ROUTE 1",
    "VIRIDIAN CITY",
    "ROUTE 22",
    "ROUTE 2",
    "VIRIDIAN FOREST",
    "FOREST EXPANSION",
    "PEWTER CITY",
    "ROUTE 3",
    "MT MOON 1F",
    "MT MOON B1F",
    "MT MOON B2F",
    "ROUTE 4",
    "CERULEAN CITY",
    "ROUTE 24",
    "ROUTE 25",
    "ROUTE 5",
    "ROUTE 6",
    "VERMILLION CITY",
    "S.S. ANNE",
    "ROUTE 11",
    "DIGLETT CAVE",
    "DIGLETT CAVE B1F",
    "ROUTE 9",
    "ROUTE 10",
    "ROCK TUNNEL 1F",
    "ROCK TUNNEL B1F",
    "ROUTE 8",
    "ROUTE 7",
    "CELADON CITY",
    "PKMN TOWER 3&5F",
    "PKMN TOWER 4F",
    "PKMN TOWER 6F",
    "PKMN TOWER 7F",
    "ROUTE 16",
    "ROUTE 17",
    "ROUTE 18",
    "ROUTE 12",
    "ROUTE 13",
    "ROUTE 14",
    "ROUTE 15",
    "FUCHSIA CITY",
    "SAFARI CENTER (ZONE 1)",
    "SAFARI EAST (ZONE 2)",
    "SAFARI NORTH (ZONE 3)",
    "SAFARI WEST (ZONE 4)",
    "SAFARI FAR-WEST (ZONE 5)",
    "ROUTE 19",
    "ROUTE 20",
    "SEAFOAM 1F",
    "SEAFOAM B1F",
    "SEAFOAM B2F",
    "SEAFOAM B3F",
    "SEAFOAM B4F",
    "SEAFOAM B3F-B4F",
    "CINNABAR ISLAND",
    "MANSION 1F",
    "MANSION 2F",
    "MANSION 3F",
    "MANSION B1F",
    "ROUTE 21A",
    "ROUTE 21B",
    "POWER PLANT",
    "ROUTE 23",
    "VICTORY ROAD 1F",
    "VICTORY ROAD 2F",
    "VICTORY ROAD 3F",
    "CERULEAN CAVE 1F",
    "CERULEAN CAVE 2F",
    "CERULEAN CAVE B1F",
    "MANSION 4F",
    "GOUGING'S ROOM",
    "KINDLE ROAD",
    "MT. EMBER EXTERIOR",
    "MT. EMBER 1F",
    "TREASURE BEACH",
    "ROCK TUNNEL (SECRET)",
    "CAPE BRINK",
    "BOND BRIDGE",
    "BERRY FOREST",
    "PKMN TOWER 8F",
    "PKMN TOWER 9F",
    "THREE ISLAND",
]


def sort_locations(locations):
    index = {name: i for i, name in enumerate(LOCATION_ORDER)}
    unknown = [l["name"] for l in locations if l["name"] not in index]
    if unknown:
        warn(f"location order: not in LOCATION_ORDER, appended at end: {unknown}")
    return sorted(
        locations,
        key=lambda l: (index.get(l["name"], len(LOCATION_ORDER)),),
    )


# --------------------------------------------------------------------- types

# Community RR dex data (drives dex.radicalred.net); its species keys carry the
# Radical Red typing, which differs from vanilla for some Pokémon.
RRDEX_DATA_URL = "https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js"


def norm_species(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


# doc short-form names -> dex keys, where suffix expansion can't get there
SPECIES_ALIASES = {
    "rotom-h": "rotom-heat",
    "rotom-w": "rotom-wash",
    "rotom-f": "rotom-frost",
    "rotom-s": "rotom-fan",
    "rotom-c": "rotom-mow",
    "tauros-blaze": "tauros-paldea-blaze",
    "tauros-aqua": "tauros-paldea-aqua",
    "tauros-combat": "tauros-paldea-combat",
    "ursaluna-bm": "ursaluna-bloodmoon",
    "deoxys-a": "deoxys-attack",
    "deoxys-d": "deoxys-defense",
    "deoxys-s": "deoxys-speed",
    "floette-e": "floette-eternal",
    "aegislash": "aegislash-shield",
    "basculin-blue": "basculin-blue-striped",
    "burmy-sandy": "burmy",
    "burmy-trash": "burmy",
    "wormadam-sa": "wormadam-sandy",
    "calyrex-i": "calyrex-ice",
    "calyrex-s": "calyrex-shadow",
    "cramorant-gorg": "cramorant-gorging",
    "darmanitan-z": "darmanitan-zen",
    "darmanitan-gz": "darmanitan-galar-zen",
    "deerling-summer": "deerling",
    "deerling-autumn": "deerling",
    "deerling-winter": "deerling",
    "enamorus-i": "enamorus",
    "enamorus-t": "enamorus-therian",
    "eternatus-max": "eternatus-eternamax",
    "genesect-douse": "genesect",
    "giratina-o": "giratina-origin",
    "gourgeist-su": "gourgeist",
    "pumpkaboo-su": "pumpkaboo",
    "pumpkaboo-sm": "pumpkaboo",
    "pumpkaboo-la": "pumpkaboo",
    "groudon-p": "groudon-primal",
    "kyogre-p": "kyogre-primal",
    "hoopa-u": "hoopa-unbound",
    "indeedee-m": "indeedee",
    "kyurem-b": "kyurem-black",
    "kyurem-w": "kyurem-white",
    "landorus-i": "landorus",
    "landorus-t": "landorus-therian",
    "thundurus-i": "thundurus",
    "thundurus-t": "thundurus-therian",
    "tornadus-i": "tornadus",
    "tornadus-t": "tornadus-therian",
    "lycanroc-d": "lycanroc-dusk",
    "magearna-o": "magearna",
    "magearna-original": "magearna",
    "necrozma-dm": "necrozma-dusk-mane",
    "necrozma-dw": "necrozma-dawn-wings",
    "ogerpon-c": "ogerpon-cornerstone",
    "ogerpon-h": "ogerpon-hearthflame",
    "ogerpon-w": "ogerpon-wellspring",
    "palkia-o": "palkia-origin",
    "shaymin-s": "shaymin-sky",
    "shellos-east": "shellos",
    "squawkabilly-g": "squawkabilly",
    "squawkabilly-w": "squawkabilly-white",
    "terapagos": "terapagos-terastal",
    "urshifu-r": "urshifu-rapid-strike",
    "urshifu-rapid": "urshifu-rapid-strike",
    "urshifu-s": "urshifu",
    "urshifu-single": "urshifu",
    "wishiwashi-sch": "wishiwashi-school",
    "wishiwashi-s-sch": "wishiwashi-sevii-school",
    "zacian-c": "zacian-crowned",
    "zamazenta-c": "zamazenta-crowned",
    "zygarde-c": "zygarde-complete",
    "alcremie-strbrry": "alcremie",
    "any cap pikachu": "pikachu",
    # RR custom Sevii forms are abbreviated '-S' in the docs
    "clawitzer-s": "clawitzer-sevii",
    "dodrio-s": "dodrio-sevii",
    "mantine-s": "mantine-sevii",
    "milotic-s": "milotic-sevii",
    "ursaring-s": "ursaring-sevii",
    "zebstrika-s": "zebstrika-sevii",
    "centiskorch-megas": "centiskorch-sevii-mega",
}

SUFFIX_EXPANSIONS = {"a": "alola", "g": "galar", "h": "hisui", "p": "paldea"}


def fetch_rrdex(refresh: bool) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "rrdex_data.js"
    if refresh or not path.exists():
        print("  downloading RR dex data.js ...")
        req = urllib.request.Request(RRDEX_DATA_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            path.write_bytes(resp.read())
    # data.js is a single JS object literal with single-quoted strings,
    # which happens to be valid Python literal syntax
    return ast.literal_eval(path.read_text())


def resolve_species_key(doc_name: str, by_norm: dict[str, list[str]]):
    lower = doc_name.lower().strip()
    if lower in SPECIES_ALIASES:
        lower = SPECIES_ALIASES[lower]
    n = norm_species(lower)
    if n in by_norm:
        return n
    m = re.match(r"^(.*)-(\w+)$", lower)
    if m and m.group(2) in SUFFIX_EXPANSIONS:
        n = norm_species(f"{m.group(1)}-{SUFFIX_EXPANSIONS[m.group(2)]}")
        if n in by_norm:
            return n
    return None


def collect_species_names(encounters: dict, bosses: dict):
    names = set()
    for loc in encounters["locations"]:
        for slots in loc["methods"].values():
            names.update(s["species"] for s in slots)
    names.update(s["species"] for s in encounters["statics"])
    names.update(g["species"] for g in encounters["gifts"])
    for t in encounters["trades"]:
        names.update((t["give"], t["receive"]))
    for group in (*encounters["fossils"].values(), *encounters["eggVendor"].values()):
        names.update(group)
    for rl in encounters["raids"]["locations"]:
        names.update(d["species"] for d in rl["dens"])
    for mode in bosses.values():
        for cat in mode["categories"]:
            for boss in cat["bosses"]:
                names.update(m["species"] for m in boss["pokemon"])
    return names


def build_types(encounters: dict, bosses: dict, refresh: bool) -> dict:
    data = fetch_rrdex(refresh)
    type_names = {t["ID"]: t["name"] for t in data["types"].values()}
    colors = {t["name"]: t["color"] for t in data["types"].values()}
    # matchup rows are attacker -> per-defender-ID values: 0=1x, 5=0.5x, 20=2x, 1=0x
    mult = {0: 1, 5: 0.5, 20: 2, 1: 0}
    matchup = {}
    for t in data["types"].values():
        row = {}
        for def_id, val in enumerate(t["matchup"]):
            def_name = type_names.get(def_id)
            if def_name is not None and mult[val] != 1:
                row[def_name] = mult[val]
        matchup[t["name"]] = row
    by_norm: dict[str, list[str]] = {}
    stats_by_norm: dict[str, dict] = {}
    for mon in data["species"].values():
        seen = []
        for tid in mon["type"]:
            tname = type_names.get(tid)
            if tname and tname not in seen:
                seen.append(tname)
        n = norm_species(mon["key"])
        by_norm[n] = seen
        # dex stat array order is the game's: HP, Atk, Def, Spe, SpA, SpD
        hp, atk, dfs, spe, spa, spd = mon["stats"]
        stats_by_norm[n] = {"HP": hp, "ATK": atk, "DEF": dfs,
                            "SPA": spa, "SPD": spd, "SPE": spe}

    species_types = {}
    species_stats = {}
    unresolved = []
    for name in sorted(collect_species_names(encounters, bosses)):
        if name.strip("?") == "":  # unknown trade placeholders
            continue
        key = resolve_species_key(name, by_norm)
        if key is None:
            unresolved.append(name)
        else:
            species_types[name] = by_norm[key]
            species_stats[name] = stats_by_norm[key]
    if unresolved:
        warn(f"types: {len(unresolved)} unresolved species: {unresolved}")
    print(f"  types resolved for {len(species_types)} species")
    return {"colors": colors, "matchup": matchup, "species": species_types,
            "stats": species_stats}


RAID_HEADER = re.compile(r"^\s*--\s*(.+?)\s*--\s*(★+)?\s*$")
RAID_SPECIES_COLS = [2, 7, 12, 17, 22]


def parse_raids(rows):
    """Raid Dens tab: '-- LOCATION -- ★' headers, then a row of 5 den species
    and a drop table (item at col+1, rate at col+3) under each species."""
    info = []
    raids = []
    current = None
    r = 0
    while r < len(rows):
        v = cell(rows, r, 2)
        m = RAID_HEADER.match(v) if v else None
        if m:
            current = {"location": m.group(1).title(), "stars": len(m.group(2) or ""),
                       "dens": []}
            raids.append(current)
            # species row follows the header
            r += 1
            dens = []
            for c in RAID_SPECIES_COLS:
                species = cell(rows, r, c)
                if species:
                    dens.append({"species": species, "drops": [], "_col": c})
            current["dens"] = dens
            # drop rows follow the 'Drops:' label row
            r += 2
            while r < len(rows):
                nxt = cell(rows, r, 2)
                if RAID_HEADER.match(nxt) if nxt else False:
                    break
                empty = True
                for den in dens:
                    c = den["_col"]
                    item = cell(rows, r, c + 1)
                    rate = cell(rows, r, c + 3)
                    if item and item != "—":
                        den["drops"].append({"item": item, "rarity": rate})
                        empty = False
                if empty and not any(cell(rows, r, c) for c in range(len(rows[r]))):
                    # blank row: keep scanning, headers are matched above
                    pass
                r += 1
            for den in dens:
                del den["_col"]
            continue
        if v and ("Badge" in v or "Hall of Fame" in v):
            info.append(v.strip())
        r += 1
    if not raids:
        warn("raids: no den sections found")
    return {"info": info, "locations": raids}


# ------------------------------------------------------------- boss rewards

def parse_tm_rewards(rows):
    """TMs & HMs tab: TM at cols 0/2/4, HM at cols 11/13/15. Keep entries whose
    location text mentions defeating someone — those are boss rewards."""
    entries = []
    for r in range(1, len(rows)):
        for num_c, move_c, text_c, kind in ((0, 2, 4, "TM"), (11, 13, 15, "HM")):
            num = cell(rows, r, num_c)
            move = cell(rows, r, move_c)
            text = cell(rows, r, text_c)
            if num and move and "defeat" in text.lower():
                entries.append({"label": f"{kind}{num} {move}", "text": text})
    if not entries:
        warn("rewards: no defeat-gated TMs found")
    return entries


def parse_tms_full(rows):
    """Full TM and HM lists with locations and follow-up notes (e.g.
    '(HARDCORE) Unavailable.') which sit on the next row, one column right."""
    tms, hms = [], []
    for r in range(1, len(rows)):
        for num_c, move_c, text_c, out in ((0, 2, 4, tms), (11, 13, 15, hms)):
            num = cell(rows, r, num_c)
            move = cell(rows, r, move_c)
            text = cell(rows, r, text_c)
            if num and move:
                out.append({"num": num, "move": move, "location": text, "notes": []})
            elif out and not num and cell(rows, r, text_c + 1):
                out[-1]["notes"].append(cell(rows, r, text_c + 1))
    return tms, hms


def parse_overworld_items(rows):
    """Overworld Items tab: area header at col 1, then item col 3 + text col 5."""
    areas = []
    current = None
    for r in range(1, len(rows)):
        header = cell(rows, r, 1)
        item = cell(rows, r, 3)
        if header and not item:
            current = {"area": header, "items": []}
            areas.append(current)
        elif item and current is not None:
            current["items"].append({"name": item, "location": cell(rows, r, 5)})
    return [a for a in areas if a["items"]]


def parse_mega_stones(rows):
    """Mega Stones tab: stone name at col 5 / col 22, description on the row
    below at col 4 / col 21."""
    stones = []
    for r in range(len(rows)):
        for name_c, text_c in ((5, 4), (22, 21)):
            name = cell(rows, r, name_c)
            if name and cell(rows, r + 1, text_c):
                stones.append({
                    "name": name,
                    "location": cell(rows, r + 1, text_c).replace("\n", " "),
                })
    if not stones:
        warn("mega stones: nothing parsed")
    return stones


def parse_z_crystals(rows):
    out = []
    for r in range(1, len(rows)):
        name = cell(rows, r, 3)
        if name:
            out.append({"name": name, "location": cell(rows, r, 5)})
    return out


# words in boss titles that are trainer classes / locations, not names
REWARD_SKIP_TOKENS = {
    "LEADER", "GYM", "LASS", "ACE", "TRAINER", "BUG", "CATCHER", "YOUNGSTER",
    "CAMPER", "PICNICKER", "SUPER", "NERD", "SAILOR", "BEAUTY", "BIRD",
    "KEEPER", "ROCKER", "FISHERMAN", "BLACK", "BELT", "BURGLAR", "GHOST",
    "ADMIN", "BOSS", "GRUNT", "RIVAL", "CHAMPION", "ELITE", "FOUR", "DUMASS",
    "&", "THE", "KID", "GAME", "CORNER", "JOYFUL", "CREATOR",
}

# rewards whose text can't be disambiguated automatically:
# label -> (category, exact title) of the boss that actually grants it
REWARD_OVERRIDES = {
    "TM072 Draco Barrage": ("Postgame", "GYM LEADER · CLAIR"),
}

# reward text phrasing -> token that appears in the boss title
REWARD_ALIASES = {
    "dumbass mudkip kid": "DUMASS",
    "claire": "CLAIR",
    "rocket admins": "ARCHER",
    "the two beauties": "BEAUTY",
    "soupercell": "CREATOR",
}


def title_tokens(title):
    parts = [p.strip() for p in title.split("·")]
    location_words = [w.strip(".,'") for w in parts[0].split()] if parts else []
    name_words = []
    for p in parts[1:]:
        for w in p.split():
            if w.upper() not in REWARD_SKIP_TOKENS and len(w) >= 3:
                name_words.append(w.strip(".,'"))
    return location_words, name_words


def reward_matches(boss, category, text):
    tl = text.lower()
    is_rematch_text = "rematch" in tl
    # Postgame blocks are the rematch-tier fights of returning trainers
    is_rematch_boss = ("Rematch" in category or "#2" in boss["title"]
                       or "(REMATCH)" in boss["title"] or category == "Postgame")
    if is_rematch_text != is_rematch_boss:
        return False
    _, name_words = title_tokens(boss["title"])
    return any(
        re.search(rf"\b{re.escape(w)}\b", text, re.I) for w in name_words
    ) or any(
        phrase in tl and token in boss["title"]
        for phrase, token in REWARD_ALIASES.items()
    )


def location_overlap(boss, text):
    location_words, _ = title_tokens(boss["title"])
    tl = text.lower()
    for w in location_words:
        w = w.lower().rstrip(".")
        if len(w) >= 4 and any(tw.startswith(w) for tw in re.findall(r"[a-z']+", tl)):
            return True
    return False


def attach_rewards(mode_data, rewards, mode_name):
    unmatched = []
    for reward in rewards:
        hits = []
        override = REWARD_OVERRIDES.get(reward["label"])
        for cat in mode_data["categories"]:
            for boss in cat["bosses"]:
                if override is not None:
                    if (cat["name"], boss["title"]) == override:
                        hits.append(boss)
                elif reward_matches(boss, cat["name"], reward["text"]):
                    hits.append(boss)
        # prefer bosses whose title location also appears in the reward text
        located = [b for b in hits if location_overlap(b, reward["text"])]
        if located:
            hits = located
        if not hits:
            unmatched.append(reward["label"])
        for boss in hits:
            boss.setdefault("rewards", []).append(reward)
    for cat in mode_data["categories"]:
        for boss in cat["bosses"]:
            boss.setdefault("rewards", [])
    if unmatched:
        warn(f"rewards({mode_name}): unmatched: {unmatched}")


def attach_order_rewards(mode_data, rewards):
    """Attach rewards to trainer-order entries via the same name/location
    matching, using a pseudo boss title of 'LOCATION · NAME'. Rewards from
    fights not in the trainer order (postgame rematches) simply don't attach."""
    entries = mode_data["trainerOrder"]
    for e in entries:
        e["rewards"] = []
    for reward in rewards:
        hits = []
        for e in entries:
            pseudo = {"title": f"{e['location']} · {e['name']}"}
            if reward_matches(pseudo, "", reward["text"]):
                hits.append((e, pseudo))
        located = [h for h in hits if location_overlap(h[1], reward["text"])]
        if located:
            hits = located
        for e, _ in hits:
            e["rewards"].append(reward)


# ------------------------------------------------------------------- bosses

NATURES = {
    "Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile",
    "Relaxed", "Impish", "Lax", "Timid", "Hasty", "Serious", "Jolly",
    "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm",
    "Gentle", "Sassy", "Careful", "Quirky",
}

SPECIES_COLS = [4, 9, 14, 19, 24, 29]


def find_base_stats_row(rows, start):
    for r in range(start + 1, min(start + 30, len(rows))):
        if cell(rows, r, 4) == "BASE STATS" or cell(rows, r, 9) == "BASE STATS":
            return r
    return None


def parse_boss_block(rows, r, tab):
    title = cell(rows, r, 2).replace("\n", " · ")
    bs = find_base_stats_row(rows, r)
    if bs is None:
        warn(f"{tab}: no BASE STATS row after anchor {title!r} at row {r}")
        return None
    nature_row, ability_row, item_row = bs - 8, bs - 7, bs - 6
    move_rows = range(bs - 5, bs - 1)
    # variant label like '(!) IF RIVAL HAS CHARMANDER' and 'BATTLE EFFECT: ...'
    # notes sit just above the block
    subtitle = ""
    battle_effect = ""
    for rr in range(max(0, r - 4), r):
        for c in range(3, 12):
            v = cell(rows, rr, c)
            if v.startswith("(!)"):
                subtitle = v.lstrip("(!) ").strip()
            elif v.startswith("BATTLE EFFECT"):
                battle_effect = v.split(":", 1)[-1].strip()
    mons = []
    for c in SPECIES_COLS:
        species = cell(rows, r, c)
        if not species or species in NON_SPECIES or species.startswith("(!)") \
                or species.endswith(":"):
            continue
        level = ""
        for rr in range(r + 1, nature_row):
            v = cell(rows, rr, c)
            if v:
                level = v
                break
        nature = cell(rows, nature_row, c)
        if nature and nature not in NATURES:
            warn(f"{tab}: {title} / {species}: unexpected nature {nature!r}")
        stats, evs = {}, {}
        for rr in range(bs + 1, bs + 7):
            label = cell(rows, rr, c)
            if label in STAT_LABELS:
                stats[label] = cell(rows, rr, c + 1)
                ev = cell(rows, rr, c + 3)
                if ev:
                    evs[label] = ev
        speed_stat = ""
        if cell(rows, bs + 7, c) == "SPEED STAT:":
            speed_stat = cell(rows, bs + 7, c + 3)
        # boosted speed rows, e.g. 'SWIFT SWIM: 104', 'CHOI. SCARF: 297'
        alt_speeds = {}
        for rr in range(bs + 8, bs + 11):
            v = cell(rows, rr, c)
            if v.endswith(":") and v != "SPEED STAT:" and cell(rows, rr, c + 3):
                alt_speeds[v.rstrip(":").title()] = cell(rows, rr, c + 3)
        mons.append({
            "species": species,
            "level": level,
            "nature": nature,
            "ability": cell(rows, ability_row, c),
            "item": cell(rows, item_row, c),
            "moves": [m for m in (cell(rows, rr, c) for rr in move_rows) if m and m != "-"],
            "baseStats": stats,
            "evs": evs,
            "speedStat": speed_stat,
            "altSpeeds": alt_speeds,
        })
    if not mons:
        return None
    return {"title": title, "subtitle": subtitle, "battleEffect": battle_effect,
            "notes": [], "pokemon": mons, "row": r}


def is_anchor(rows, r):
    if not cell(rows, r, 2):
        return False
    v = cell(rows, r, 4) or cell(rows, r, 9)
    # labels like 'CHOI. SCARF:' are alt-speed rows, not species
    return bool(v) and v not in NON_SPECIES and not v.startswith("(!)") \
        and not v.endswith(":")


def parse_boss_tab(rows, tab):
    bosses = []
    for r in range(len(rows)):
        if not cell(rows, r, 2):
            continue
        if is_anchor(rows, r):
            block = parse_boss_block(rows, r, tab)
            if block:
                bosses.append(block)
        elif bosses:
            # continuation note like "IF YOU'RE / LEVEL 27 ->>"
            note = cell(rows, r, 2).replace("\n", " ")
            if "CLICK" not in note:
                bosses[-1]["notes"].append(note)
    # merge trailing note fragments, drop helper row index
    for b in bosses:
        b["notes"] = " ".join(b["notes"]).strip()
        del b["row"]
    return bosses


def parse_trainer_order(rows, tab):
    """Trainer Order tab: (OPTIONAL) marker col2, trainer name col3 (+cap col5),
    then location col3 on the following row."""
    out = []
    optional = False
    pending = None
    for r in range(len(rows)):
        c2, c3, c5 = cell(rows, r, 2), cell(rows, r, 3), cell(rows, r, 5)
        if "OPTIONAL" in c2:
            optional = True
            continue
        if "CLICK" in c2 or "LEVEL CAPS" in c5 or "TO INSTANTLY" in c2:
            continue
        if c3:
            if pending is None:
                pending = {"name": c3, "levelCap": c5, "optional": optional}
                optional = False
            else:
                pending["location"] = c3
                out.append(pending)
                pending = None
    if pending is not None:
        pending["location"] = ""
        out.append(pending)
    return out


def parse_boss_sheet(sheet_id, prefix, refresh):
    categories = []
    order = []
    for tab, gid in BOSS_TABS.items():
        rows = fetch_csv(sheet_id, gid, f"{prefix}_{slugify(tab)}", refresh)
        if tab == "Trainer Order":
            order = parse_trainer_order(rows, f"{prefix}/{tab}")
        else:
            bosses = parse_boss_tab(rows, f"{prefix}/{tab}")
            print(f"  {prefix}/{tab}: {len(bosses)} boss blocks")
            categories.append({"name": tab, "bosses": bosses})
    return {"trainerOrder": order, "categories": categories}


# --------------------------------------------------------------------- main

def main():
    refresh = "--refresh" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)

    print("Encounters sheet:")
    tabs = {n: fetch_csv(ENCOUNTERS_SHEET, g, f"enc_{n}", refresh)
            for n, g in ENCOUNTER_TABS.items()}

    locations = parse_grass(tabs["grass"])
    by_name = {l["name"]: l for l in locations}
    fishing, fish_order = parse_fishing(tabs["fishing"])
    for name in fish_order:
        loc = by_name.get(name)
        if loc is None:
            loc = {"name": name, "postgame": False, "methods": {}}
            by_name[name] = loc
            # water-only locations: PALLET TOWN belongs at the front
            if name == "PALLET TOWN":
                locations.insert(0, loc)
            else:
                locations.append(loc)
        loc["methods"].update(fishing[name])
    for z in parse_safari(tabs["safari"]):
        z["postgame"] = False
        locations.append(z)
    locations = sort_locations(locations)
    for loc in locations:
        loc["id"] = slugify(loc["name"])

    encounters = {
        "locations": locations,
        "statics": parse_statics(tabs["statics"]),
        "gifts": parse_gifts(tabs["gifts"]),
        "trades": parse_trades(tabs["trades"]),
        "fossils": parse_fossils(tabs["fossils"]),
        "eggVendor": parse_egg_vendor(tabs["egg_vendor"]),
        "raids": parse_raids(tabs["raids"]),
    }
    n_slots = sum(len(m) for l in locations for m in l["methods"].values())
    print(f"  {len(locations)} locations, {n_slots} encounter slots, "
          f"{len(encounters['statics'])} statics, {len(encounters['gifts'])} gifts, "
          f"{len(encounters['trades'])} trades")

    print("Default bosses sheet:")
    default = parse_boss_sheet(DEFAULT_BOSSES_SHEET, "default", refresh)
    print("Hardcore bosses sheet:")
    hardcore = parse_boss_sheet(HARDCORE_BOSSES_SHEET, "hardcore", refresh)

    print("Item/TM locations sheet:")
    tm_rows = fetch_csv(ITEMS_SHEET, TMS_TAB_GID, "items_tms", refresh)
    tms, hms = parse_tms_full(tm_rows)
    overworld = parse_overworld_items(
        fetch_csv(ITEMS_SHEET, OVERWORLD_ITEMS_GID, "items_overworld", refresh))
    mega_stones = parse_mega_stones(
        fetch_csv(ITEMS_SHEET, MEGA_STONES_GID, "items_mega", refresh))
    z_crystals = parse_z_crystals(
        fetch_csv(ITEMS_SHEET, Z_CRYSTALS_GID, "items_zcrystals", refresh))
    items = {"tms": tms, "hms": hms, "overworld": overworld,
             "megaStones": mega_stones, "zCrystals": z_crystals}
    n_ow = sum(len(a["items"]) for a in overworld)
    print(f"  {len(tms)} TMs, {len(hms)} HMs, {n_ow} overworld items in "
          f"{len(overworld)} areas, {len(mega_stones)} mega stones, "
          f"{len(z_crystals)} z-crystals")
    rewards = parse_tm_rewards(tm_rows)
    print(f"  {len(rewards)} defeat-gated TM/HM rewards")
    attach_rewards(default, rewards, "default")
    attach_rewards(hardcore, rewards, "hardcore")
    attach_order_rewards(default, rewards)
    attach_order_rewards(hardcore, rewards)

    bosses = {"default": default, "hardcore": hardcore}

    print("RR dex types:")
    types = build_types(encounters, bosses, refresh)

    (OUT / "encounters.json").write_text(json.dumps(encounters, ensure_ascii=False, indent=1))
    (OUT / "bosses.json").write_text(json.dumps(bosses, ensure_ascii=False, indent=1))
    (OUT / "types.json").write_text(json.dumps(types, ensure_ascii=False, indent=1))
    (OUT / "items.json").write_text(json.dumps(items, ensure_ascii=False, indent=1))
    print(f"\nWrote encounters.json, bosses.json, types.json and items.json to {OUT}")
    if warnings:
        print(f"{len(warnings)} warnings — review above.")


if __name__ == "__main__":
    main()
