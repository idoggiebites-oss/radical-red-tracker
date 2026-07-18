/** Best-effort sprite URLs from Pokémon Showdown's name-based sprite CDN.
 * The docs use short form suffixes (Geodude-A, Zorua-Hisui, Rotom-F ...).
 * Unknown names simply 404 and the <img> hides itself. */

const SPECIAL: Record<string, string> = {
  "rotom-f": "rotom-frost",
  "rotom-w": "rotom-wash",
  "rotom-h": "rotom-heat",
  "rotom-s": "rotom-fan",
  "rotom-c": "rotom-mow",
  "tauros-blaze": "tauros-paldeablaze",
  "tauros-aqua": "tauros-paldeaaqua",
  "tauros-combat": "tauros-paldeacombat",
  "ursaluna-bm": "ursaluna-bloodmoon",
  "farfetch-d": "farfetchd",
  "farfetch-d-galar": "farfetchd-galar",
  "sirfetch-d": "sirfetchd",
  "mr-mime": "mrmime",
  "mr-mime-galar": "mrmime-galar",
  "mr-rime": "mrrime",
  "mime-jr": "mimejr",
  "type-null": "typenull",
  "ho-oh": "hooh",
  "porygon-z": "porygonz",
  "nidoran-f": "nidoranf",
  "nidoran-m": "nidoranm",
  "deoxys-a": "deoxys-attack",
  "deoxys-d": "deoxys-defense",
  "deoxys-s": "deoxys-speed",
};

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
  const slug = speciesSlug(species);
  return [
    `https://play.pokemonshowdown.com/sprites/gen5/${slug}.png`,
    `https://play.pokemonshowdown.com/sprites/dex/${slug}.png`,
  ];
}

function speciesSlug(species: string): string {
  let slug = species
    .toLowerCase()
    .replace(/[’']/g, "-")
    .replace(/[. ]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  if (SPECIAL[slug]) {
    slug = SPECIAL[slug];
  } else {
    const dash = slug.indexOf("-");
    if (dash > 0) {
      const base = slug.slice(0, dash);
      const suffix = slug.slice(dash + 1);
      if (SUFFIX[suffix]) slug = `${base}-${SUFFIX[suffix]}`;
    }
  }
  return slug;
}
