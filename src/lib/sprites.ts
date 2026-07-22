/** Best-effort sprite URLs: Pokémon Showdown's name-based CDN first, then
 * the RR Pokédex repo's front sprite by dex ID — that one covers RR customs
 * (Sevii forms, custom megas) Showdown will never have. Unknown names simply
 * 404 through the chain and the <img> hides itself. */

import typesJson from "../data/types.json";

const SPRITE_IDS = (typesJson as unknown as { spriteIds: Record<string, number> })
  .spriteIds;

const RRDEX_SPECIES =
  "https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/graphics/species/front";

/** normalized doc names -> Showdown slugs, where suffix expansion can't
 * get there. Keys are post-normalization (lowercase, punctuation and
 * spaces stripped, accents folded). */
const SPECIAL: Record<string, string> = {
  // dashes that are part of the name, not a form
  "ho-oh": "hooh",
  "porygon-z": "porygonz",
  "nidoran-f": "nidoranf",
  "nidoran-m": "nidoranm",
  "jangmo-o": "jangmoo",
  "hakamo-o": "hakamoo",
  "kommo-o": "kommoo",
  "chi-yu": "chiyu",
  "chien-pao": "chienpao",
  "ting-lu": "tinglu",
  "wo-chien": "wochien",
  // rotom / deoxys / paldea short forms
  "rotom-f": "rotom-frost",
  "rotom-w": "rotom-wash",
  "rotom-h": "rotom-heat",
  "rotom-s": "rotom-fan",
  "rotom-c": "rotom-mow",
  "deoxys-a": "deoxys-attack",
  "deoxys-d": "deoxys-defense",
  "deoxys-s": "deoxys-speed",
  "tauros-blaze": "tauros-paldeablaze",
  "tauros-aqua": "tauros-paldeaaqua",
  "tauros-combat": "tauros-paldeacombat",
  "ursaluna-bm": "ursaluna-bloodmoon",
  // regional short forms not covered by the generic suffix expansion
  "farfetchd-g": "farfetchd-galar",
  "mrmime-g": "mrmime-galar",
  // legendaries & forms the docs abbreviate
  "landorus-i": "landorus",
  "landorus-t": "landorus-therian",
  "thundurus-i": "thundurus",
  "thundurus-t": "thundurus-therian",
  "tornadus-i": "tornadus",
  "tornadus-t": "tornadus-therian",
  "enamorus-i": "enamorus",
  "enamorus-t": "enamorus-therian",
  "kyurem-b": "kyurem-black",
  "kyurem-w": "kyurem-white",
  "calyrex-i": "calyrex-ice",
  "calyrex-s": "calyrex-shadow",
  "necrozma-dm": "necrozma-duskmane",
  "necrozma-dw": "necrozma-dawnwings",
  "zacian-c": "zacian-crowned",
  "zamazenta-c": "zamazenta-crowned",
  "zygarde-c": "zygarde-complete",
  "hoopa-u": "hoopa-unbound",
  "giratina-o": "giratina-origin",
  "palkia-o": "palkia-origin",
  "magearna-o": "magearna-original",
  "shaymin-s": "shaymin-sky",
  "lycanroc-d": "lycanroc-dusk",
  "urshifu-r": "urshifu-rapidstrike",
  "urshifu-rapid": "urshifu-rapidstrike",
  "urshifu-rapid-strike": "urshifu-rapidstrike",
  "urshifu-s": "urshifu",
  "urshifu-single": "urshifu",
  "ogerpon-c": "ogerpon-cornerstone",
  "ogerpon-h": "ogerpon-hearthflame",
  "ogerpon-w": "ogerpon-wellspring",
  "groudon-p": "groudon-primal",
  "kyogre-p": "kyogre-primal",
  "wishiwashi-sch": "wishiwashi-school",
  "darmanitan-z": "darmanitan-zen",
  "darmanitan-gz": "darmanitan-galarzen",
  "cramorant-gorg": "cramorant-gorging",
  "eternatus-max": "eternatus-eternamax",
  "gourgeist-su": "gourgeist-super",
  "pumpkaboo-su": "pumpkaboo-super",
  "pumpkaboo-sm": "pumpkaboo-small",
  "pumpkaboo-la": "pumpkaboo-large",
  "indeedee-m": "indeedee",
  "squawkabilly-g": "squawkabilly",
  "squawkabilly-w": "squawkabilly-white",
  "wormadam-sa": "wormadam-sandy",
  "toxtricity-low-key": "toxtricity-lowkey",
  "basculin-blue": "basculin-bluestriped",
  "alcremie-strbrry": "alcremie",
  "anycappikachu": "pikachu",
};

/** species with an official mega — Showdown hosts those sprites; a "-Mega"
 * on any other species is an RR custom that only the RR dex has. The canon
 * list is frozen, so this can't rot. */
const CANON_MEGA = new Set([
  "venusaur", "charizard", "blastoise", "beedrill", "pidgeot", "alakazam",
  "slowbro", "gengar", "kangaskhan", "pinsir", "gyarados", "aerodactyl",
  "mewtwo", "ampharos", "steelix", "scizor", "heracross", "houndoom",
  "tyranitar", "sceptile", "blaziken", "swampert", "gardevoir", "sableye",
  "mawile", "aggron", "medicham", "manectric", "sharpedo", "camerupt",
  "altaria", "banette", "absol", "glalie", "salamence", "metagross",
  "latias", "latios", "rayquaza", "lopunny", "garchomp", "lucario",
  "abomasnow", "gallade", "audino", "diancie",
]);

const SUFFIX: Record<string, string> = {
  a: "alola",
  g: "galar",
  h: "hisui",
  p: "paldea",
  alola: "alola",
  galar: "galar",
  hisui: "hisui",
  hisuian: "hisui",
  paldea: "paldea",
  mega: "mega",
  "mega-x": "megax",
  "mega-y": "megay",
  gmax: "gmax",
  therian: "therian",
  origin: "origin",
};

export function spriteUrls(species: string): string[] {
  const { slug, customForm } = speciesSlug(species);
  const showdown = [
    `https://play.pokemonshowdown.com/sprites/gen5/${slug}.png`,
    `https://play.pokemonshowdown.com/sprites/dex/${slug}.png`,
  ];
  const id = SPRITE_IDS[species];
  // the RR dex repo's raw PNGs have no alpha channel — a chroma-key
  // background bakes in as a solid green/pink box. scripts/clean_rrdex_sprites.py
  // pre-cleans the RR-custom set (Sevii forms, custom megas) into
  // public/sprites/custom/<id>.png; that goes first, with the original
  // (uncleaned) URL kept as a fallback for anything not yet processed
  const cleaned =
    customForm && id !== undefined
      ? [`${import.meta.env.BASE_URL}sprites/custom/${id}.png`]
      : [];
  const rrdex = id !== undefined ? [`${RRDEX_SPECIES}/${id}.png`] : [];
  // a form suffix Showdown has no slug for (Sevii forms etc.) is an RR
  // custom — its dex sprite goes first so we don't fire two doomed 404s
  return customForm ? [...cleaned, ...rrdex, ...showdown] : [...showdown, ...rrdex];
}

function speciesSlug(species: string): { slug: string; customForm: boolean } {
  // Showdown filenames drop punctuation and join multi-word names with
  // nothing ("Tapu Koko" -> tapukoko, "Mr. Mime" -> mrmime, Flabébé ->
  // flabebe); dashes only separate forms
  let slug = species
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'.:]/g, "")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  let customForm = false;
  if (SPECIAL[slug]) {
    slug = SPECIAL[slug];
  } else {
    const dash = slug.indexOf("-");
    if (dash > 0) {
      const base = slug.slice(0, dash);
      const suffix = slug.slice(dash + 1);
      if (SUFFIX[suffix]) {
        slug = `${base}-${SUFFIX[suffix]}`;
        if (suffix.startsWith("mega") && !CANON_MEGA.has(base)) customForm = true;
      } else {
        customForm = true;
      }
    }
  }
  return { slug, customForm };
}
