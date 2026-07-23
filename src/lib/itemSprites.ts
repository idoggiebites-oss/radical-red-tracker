/** Best-effort held-item sprites: a locally pre-cleaned copy first (RR-custom
 * items — see scripts/clean_rrdex_items.py), then PokeAPI (real alpha
 * transparency), then the RR dex repo uncleaned as a last resort — its raw
 * PNGs have no alpha channel, a chroma-key background bakes in as opaque
 * pixels. */

import itemsJson from "../data/items.json";

const spriteIds = (itemsJson as unknown as { spriteIds: Record<string, number> })
  .spriteIds;

const RRDEX_ITEMS =
  "https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/graphics/items";
const POKEAPI_ITEMS =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

// the docs suffix overworld item names with a pickup count — usually
// bracketed ("Rare Candy [x1]"), occasionally not ("Calcium x1") — that
// isn't part of the item's name; strip it before normalizing or the
// lookup silently fails (no sprite renders at all, not even the uncleaned
// rrdex fallback)
const stripQty = (s: string) => s.replace(/\[.*?\]/g, "").replace(/\s+x\d+$/i, "");

const norm = (s: string) =>
  stripQty(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // fold accents ("Poké" -> "poke") before stripping
    .replace(/[^a-z0-9]+/g, "");

// docs spellings / abbreviations -> the dex item table's names
const ALIASES: Record<string, string> = {
  abomasnite: "abomasite",
  blastoisinite: "blastoisnite",
  kangaskhanite: "kangaskanite",
  houndoominite: "houndoomnite",
  heavydboots: "heavydutyboots",
  leek: "leekstick",
  cornermask: "cornerstonemask",
  hearthmask: "hearthflamemask",
  wellmask: "wellspringmask",
  beedrilite: "beedrillite",
  // Z-Crystals the docs abbreviate down to just "<type>ium" (no "Z", and a
  // few spelled differently from the dex's own key) — the regular ones are
  // covered by the "try appending z" fallback below
  bugium: "buginiumz",
  mewium: "mewniumz",
  aloraichium: "alorichiumz",
  ultranecrozium: "necroziumz",
};

const idCache = new Map<string, number | null>();

// the two item tables spell Z-Crystals differently: the reference table
// drops the "Z" entirely ("Bugium"), the overworld pickup table spells it
// out ("Bugium Z", which norm() collapses onto the same "bugiumz" as a
// plain-Z-suffix name) — try each name as-is, with a trailing "z" appended,
// and with a trailing "z" removed, through the alias table each time
function lookup(n: string): number | null {
  const key = ALIASES[n] ?? n;
  return spriteIds[key] ?? spriteIds[key + "z"] ?? null;
}

// ground-pickup TM/HM items ("TM 057 - Temper Flare") — the dex's own key
// is just "tm"/"hm" + the 2-digit-minimum number, no move name, no padding
// beyond 2 digits ("tm120" not "tm0120")
const TM_HM = /^(tm|hm)\s*0*(\d+)/i;

function itemId(name: string): number | null {
  const n0 = norm(name);
  if (!n0) return null;
  const hit = idCache.get(n0);
  if (hit !== undefined) return hit;
  const tmHm = name.trim().match(TM_HM);
  if (tmHm) {
    const key = `${tmHm[1].toLowerCase()}${tmHm[2].padStart(2, "0")}`;
    const id = spriteIds[key] ?? null;
    idCache.set(n0, id);
    return id;
  }
  let id = lookup(n0);
  if (id === null && n0.endsWith("z") && n0.length > 1) id = lookup(n0.slice(0, -1));
  // the docs abbreviate long names with a trailing dot ("Weakness Pol.")
  if (id === null && name.trim().endsWith(".")) {
    const key = Object.keys(spriteIds).find((k) => k.startsWith(n0));
    if (key) id = spriteIds[key];
  }
  idCache.set(n0, id);
  return id;
}

/** true for the docs' various "no item" spellings */
export function isNoItem(name: string): boolean {
  const t = name.trim();
  return !t || /^-+$/.test(t) || t === "—" || /no item/i.test(t);
}

export function itemSpriteUrls(name: string): string[] {
  if (isNoItem(name)) return [];
  const urls: string[] = [];
  const id = itemId(name);
  // pre-cleaned local copy (flood-filled alpha) for RR-custom items whose
  // only source is the RR dex repo — see scripts/clean_rrdex_items.py
  if (id !== null) urls.push(`${import.meta.env.BASE_URL}sprites/items/${id}.png`);
  // PokeAPI's item sprites have real alpha transparency; the RR dex repo's
  // raw PNGs don't (a solid chroma-key background bakes in as opaque
  // pixels, same issue as the species sprites) — try PokeAPI next and
  // only fall back to the RR dex for RR-custom items PokeAPI can't have
  // (custom mega stones, Z-crystals, renamed items) that we haven't
  // cleaned locally yet
  const slug = stripQty(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'.]/g, "")
    .trim()
    .replace(/[ _]+/g, "-");
  if (slug) urls.push(`${POKEAPI_ITEMS}/${slug}.png`);
  if (id !== null) urls.push(`${RRDEX_ITEMS}/${id}.png`);
  return urls;
}
