/** Best-effort held-item sprites: the RR dex repo hosts one per item ID
 * (incl. RR's custom mega stones), with PokeAPI as a fallback for the few
 * items the dex data doesn't carry (Charizardite X/Y, Aerodactylite ...). */

import itemsJson from "../data/items.json";

const spriteIds = (itemsJson as unknown as { spriteIds: Record<string, number> })
  .spriteIds;

const RRDEX_ITEMS =
  "https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/graphics/items";
const POKEAPI_ITEMS =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

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
  ultranecroziumz: "necroziumz",
};

const idCache = new Map<string, number | null>();

function itemId(name: string): number | null {
  const n0 = norm(name);
  if (!n0) return null;
  const hit = idCache.get(n0);
  if (hit !== undefined) return hit;
  const n = ALIASES[n0] ?? n0;
  let id: number | null = spriteIds[n] ?? null;
  // the docs abbreviate long names with a trailing dot ("Weakness Pol.")
  if (id === null && name.trim().endsWith(".")) {
    const key = Object.keys(spriteIds).find((k) => k.startsWith(n));
    if (key) id = spriteIds[key];
  }
  idCache.set(n0, id);
  return id;
}

/** true for the docs' various "no item" spellings */
export function isNoItem(name: string): boolean {
  const t = name.trim();
  return !t || t === "-" || t === "—" || /no item/i.test(t);
}

export function itemSpriteUrls(name: string): string[] {
  if (isNoItem(name)) return [];
  const urls: string[] = [];
  const id = itemId(name);
  if (id !== null) urls.push(`${RRDEX_ITEMS}/${id}.png`);
  const slug = name
    .toLowerCase()
    .replace(/[’'.]/g, "")
    .trim()
    .replace(/[ _]+/g, "-");
  if (slug) urls.push(`${POKEAPI_ITEMS}/${slug}.png`);
  return urls;
}
