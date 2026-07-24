/** Adapter around the vendored RR damage-calc engine.
 * Gen 9 in the vendored data set carries the Radical Red changes. */

import * as rr from "rr-damage-calc";
import { getFinalSpeed } from "rr-damage-calc/mechanics/util.js";
import typesJson from "../data/types.json";
import type { BossMon } from "../types";

export const GEN = 9;
const gen = rr.Generations.get(GEN);

export const NATURES = [
  "Adamant", "Bashful", "Bold", "Brave", "Calm", "Careful", "Docile",
  "Gentle", "Hardy", "Hasty", "Impish", "Jolly", "Lax", "Lonely", "Mild",
  "Modest", "Naive", "Naughty", "Quiet", "Quirky", "Rash", "Relaxed",
  "Sassy", "Serious", "Timid",
];

/** item and ability name lists from the calc data, for pickers. Deduped —
 * the vendored data has at least one real duplicate (Mountaineer: once in
 * the inherited base-game list, again in the RR-specific additions), which
 * broke every <datalist>/<select> built from these with a React duplicate-
 * key warning */
export const ITEM_NAMES: string[] = [...new Set(rr.ITEMS[GEN] ?? [])].sort();
export const ABILITY_NAMES: string[] = [...new Set(rr.ABILITIES[GEN] ?? [])].sort();

/** RR base stats as the engine sees them, keyed by display label */
export function calcBaseStats(docName: string): Record<string, number> | null {
  const species = resolveSpecies(docName);
  if (!species) return null;
  const hit = gen.species.get(rr.toID(species));
  if (!hit) return null;
  const b = hit.baseStats;
  return { HP: b.hp, ATK: b.atk, DEF: b.def, SPA: b.spa, SPD: b.spd, SPE: b.spe };
}

/** every move name the calc knows, for pickers */
export const MOVE_NAMES: string[] = (() => {
  const names: string[] = [];
  try {
    for (const m of gen.moves) names.push(m.name);
  } catch {
    // iteration shape changed: pickers degrade to free text
  }
  return names.sort();
})();

// docs short-form names -> calc species names (same semantics as the importer)
const ALIASES: Record<string, string> = {
  "rotom-h": "Rotom-Heat",
  "rotom-w": "Rotom-Wash",
  "rotom-f": "Rotom-Frost",
  "rotom-s": "Rotom-Fan",
  "rotom-c": "Rotom-Mow",
  "tauros-blaze": "Tauros-Paldea-Blaze",
  "tauros-aqua": "Tauros-Paldea-Aqua",
  "tauros-combat": "Tauros-Paldea-Combat",
  "ursaluna-bm": "Ursaluna-Bloodmoon",
  "deoxys-a": "Deoxys-Attack",
  "deoxys-d": "Deoxys-Defense",
  "deoxys-s": "Deoxys-Speed",
  "floette-e": "Floette-Eternal",
  "clawitzer-s": "Clawitzer-Sevii",
  "dodrio-s": "Dodrio-Sevii",
  "mantine-s": "Mantine-Sevii",
  "milotic-s": "Milotic-Sevii",
  "ursaring-s": "Ursaring-Sevii",
  "zebstrika-s": "Zebstrika-Sevii",
  "wishiwashi-s-sch": "Wishiwashi-Sevii-School",
  "wishiwashi-sch": "Wishiwashi-School",
  "centiskorch-megas": "Centiskorch-Sevii-Mega",
  "darmanitan-z": "Darmanitan-Zen",
  "darmanitan-gz": "Darmanitan-Galar-Zen",
  "basculin-blue": "Basculin-Blue-Striped",
  "wormadam-sa": "Wormadam-Sandy",
  // purely cosmetic doc forms (no stat/type difference at all, so the calc
  // engine only ever tracks the base species): flavor, cloak, coat, season
  "alcremie-strbrry": "Alcremie",
  "burmy-sandy": "Burmy",
  "burmy-trash": "Burmy",
  "deerling-autumn": "Deerling",
  "deerling-summer": "Deerling",
  "deerling-winter": "Deerling",
  "shellos-east": "Shellos",
  "any cap pikachu": "Pikachu",
  // Incarnate Forme is the engine's unsuffixed default, not a distinct entry
  "enamorus-i": "Enamorus",
  "landorus-i": "Landorus",
  "thundurus-i": "Thundurus",
  "tornadus-i": "Tornadus",
  // Squawkabilly Green / Urshifu Single Strike are likewise the default
  "squawkabilly-g": "Squawkabilly",
  "urshifu-s": "Urshifu",
  "urshifu-single": "Urshifu",
  // forms whose doc abbreviation isn't a single trailing letter, so the
  // generic SUFFIXES expansion below can't reach them
  "calyrex-i": "Calyrex-Ice",
  "calyrex-s": "Calyrex-Shadow",
  "cramorant-gorg": "Cramorant-Gorging",
  "enamorus-t": "Enamorus-Therian",
  "eternatus-max": "Eternatus-Eternamax",
  "giratina-o": "Giratina-Origin",
  "gourgeist-su": "Gourgeist-Super",
  "hoopa-u": "Hoopa-Unbound",
  "indeedee-m": "Indeedee",
  "kyurem-b": "Kyurem-Black",
  "kyurem-w": "Kyurem-White",
  "landorus-t": "Landorus-Therian",
  "lycanroc-d": "Lycanroc-Dusk",
  "magearna-o": "Magearna-Original",
  "necrozma-dm": "Necrozma-Dusk-Mane",
  "necrozma-dw": "Necrozma-Dawn-Wings",
  "ogerpon-c": "Ogerpon-Cornerstone",
  "ogerpon-h": "Ogerpon-Hearthflame",
  "ogerpon-w": "Ogerpon-Wellspring",
  "palkia-o": "Palkia-Origin",
  "pumpkaboo-la": "Pumpkaboo-Large",
  "pumpkaboo-sm": "Pumpkaboo-Small",
  "pumpkaboo-su": "Pumpkaboo-Super",
  "shaymin-s": "Shaymin-Sky",
  "squawkabilly-w": "Squawkabilly-White",
  "thundurus-t": "Thundurus-Therian",
  "tornadus-t": "Tornadus-Therian",
  "urshifu-r": "Urshifu-Rapid-Strike",
  "urshifu-rapid": "Urshifu-Rapid-Strike",
  "zacian-c": "Zacian-Crowned",
  "zamazenta-c": "Zamazenta-Crowned",
  "zygarde-c": "Zygarde-Complete",
};

// "-P" only ever means Primal in this dataset (Groudon-P/Kyogre-P) — Paldean
// forms use full names via ALIASES above, so there's no collision
const SUFFIXES: Record<string, string> = { a: "-Alola", g: "-Galar", h: "-Hisui", p: "-Primal" };

// fold accents before matching — the docs' "Flabébé" uses a precomposed é
// (NFC) but the vendored calc engine's own species table happens to spell
// it with a decomposed e+combining-accent (NFD); both reduce to the same
// plain-ASCII "flabebe" once folded, but compared as raw strings they
// never match (same idiom as sprites.ts's speciesSlug())
const foldAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** docs species name -> calc species name, or null when the calc data
 * doesn't know it (never guess a wrong mon). */
export function resolveSpecies(docName: string): string | null {
  const folded = foldAccents(docName);
  const lower = folded.toLowerCase().trim();
  const candidates = [folded, ALIASES[lower] ?? ""];
  const m = lower.match(/^(.*)-(\w)$/);
  if (m && SUFFIXES[m[2]]) candidates.push(m[1] + SUFFIXES[m[2]]);
  for (const cand of candidates) {
    if (!cand) continue;
    const hit = gen.species.get(rr.toID(cand));
    if (hit) return hit.name;
  }
  return null;
}

const DOC_SPECIES = Object.keys(
  (typesJson as { species: Record<string, unknown> }).species,
);

/** engine name -> the doc-style name the app's data/sprites understand;
 * built lazily, preferring a doc name identical to the engine's */
let engineToDoc: Map<string, string> | null = null;
function docNameFor(engineName: string): string | null {
  if (!engineToDoc) {
    engineToDoc = new Map();
    for (const doc of DOC_SPECIES) {
      const eng = resolveSpecies(doc);
      if (!eng) continue;
      const prev = engineToDoc.get(eng);
      if (prev === eng) continue;
      if (doc === eng || !prev) engineToDoc.set(eng, doc);
    }
  }
  return engineToDoc.get(engineName) ?? null;
}

/** alternate forms reachable from this species (megas, Deoxys modes,
 * Rotom appliances, ...), as doc-style names the rest of the app resolves.
 * Only forms present in the RR dex data are returned. */
export function formsFor(docName: string): string[] {
  const engine = resolveSpecies(docName);
  if (!engine) return [];
  const entry = gen.species.get(rr.toID(engine));
  if (!entry) return [];
  const baseName = entry.baseSpecies ?? entry.name;
  const baseEntry = gen.species.get(rr.toID(baseName)) ?? entry;
  const family = [baseName, ...(baseEntry.otherFormes ?? [])];
  const baseStats = JSON.stringify(baseEntry.baseStats);
  const baseTypes = JSON.stringify(baseEntry.types ?? []);
  const out: string[] = [];
  for (const f of family) {
    const fe = gen.species.get(rr.toID(f));
    if (!fe) continue;
    // cosmetic forms (cosplay Pikachu, ...) change neither stats nor typing
    if (
      f !== baseName &&
      JSON.stringify(fe.baseStats) === baseStats &&
      JSON.stringify(fe.types ?? []) === baseTypes
    ) {
      continue;
    }
    const doc = docNameFor(f);
    if (doc && doc !== docName && !out.includes(doc)) out.push(doc);
  }
  return out;
}

// the docs abbreviate long move names — a trailing dot ("High Horsep.") or
// a truncated middle word ("Pow-Up Punch", "Double I. Bash") — resolved by
// prefix-matching every word against the real move list, grouped by word
// count so "Clang. Soul" can't accidentally match a two-word move that
// isn't even close (needs the same number of words, in the same order)
const MOVE_TOKEN_GROUPS: Map<number, { name: string; toks: string[] }[]> = (() => {
  const groups = new Map<number, { name: string; toks: string[] }[]>();
  for (const name of MOVE_NAMES) {
    const toks = name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ");
    const list = groups.get(toks.length) ?? [];
    list.push({ name, toks });
    groups.set(toks.length, list);
  }
  return groups;
})();

/** one doc abbreviation is genuinely ambiguous by prefix alone (both
 * "Clangorous Soul" and "Clangorous Soulblaze" start the same way) */
const MOVE_ALIASES: Record<string, string> = {
  "clang. soul": "Clangorous Soul", // Kommo-o's signature, not Zacian/Zamazenta's
};

function withinOneEdit(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (s.length === l.length) i++;
    j++;
  }
  return true;
}

function resolveAbbrevMove(doc: string): string | null {
  const alias = MOVE_ALIASES[doc.trim().toLowerCase()];
  if (alias) return alias;
  const toks = doc.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ");
  const candidates = MOVE_TOKEN_GROUPS.get(toks.length) ?? [];
  const matches = candidates.filter((c) =>
    toks.every((t, i) => c.toks[i] === t || c.toks[i].startsWith(t)),
  );
  if (matches.length === 1) return matches[0].name;
  if (matches.length > 0) return null; // ambiguous — don't guess
  // a straight typo ("Eathquake"): fall back to one-edit whole-name distance
  const joined = toks.join("");
  const fuzzy = candidates.filter((c) => withinOneEdit(joined, c.toks.join("")));
  return fuzzy.length === 1 ? fuzzy[0].name : null;
}

export function resolveMove(docMove: string): string | null {
  let name = docMove.trim();
  if (name === "-" || !name) return null;
  if (/^HP /i.test(name)) name = "Hidden Power " + name.slice(3);
  const hit = gen.moves.get(rr.toID(name));
  if (hit) return hit.name;
  return resolveAbbrevMove(name);
}

/** battle effect text from the boss docs -> calc field settings */
export function fieldFromBattleEffect(effect: string): rr.FieldOptions {
  const e = effect.toUpperCase();
  const out: rr.FieldOptions = {};
  if (e.includes("SANDSTORM")) out.weather = "Sand";
  else if (e.includes("RAIN")) out.weather = "Rain";
  else if (e.includes("SUN")) out.weather = "Sun";
  else if (e.includes("HAIL")) out.weather = "Hail";
  else if (e.includes("SNOW")) out.weather = "Snow";
  if (e.includes("ELECTRIC TERRAIN")) out.terrain = "Electric";
  else if (e.includes("GRASSY TERRAIN")) out.terrain = "Grassy";
  else if (e.includes("PSYCHIC TERRAIN")) out.terrain = "Psychic";
  else if (e.includes("MISTY TERRAIN")) out.terrain = "Misty";
  return out;
}

/** weather summoned on switch-in, keyed by ability id */
const WEATHER_ABILITIES: Record<string, string> = {
  drizzle: "Rain",
  drought: "Sun",
  orichalcumpulse: "Sun",
  sandstream: "Sand",
  snowwarning: "Snow",
  primordialsea: "Heavy Rain",
  desolateland: "Harsh Sunshine",
  deltastream: "Strong Winds",
};

/** terrain summoned on switch-in, keyed by ability id */
const TERRAIN_ABILITIES: Record<string, string> = {
  electricsurge: "Electric",
  hadronengine: "Electric",
  grassysurge: "Grassy",
  psychicsurge: "Psychic",
  mistysurge: "Misty",
};

export function weatherFromAbility(ability?: string): string | undefined {
  return ability ? WEATHER_ABILITIES[rr.toID(ability)] : undefined;
}

export function terrainFromAbility(ability?: string): string | undefined {
  return ability ? TERRAIN_ABILITIES[rr.toID(ability)] : undefined;
}

/** fill weather/terrain the user left unset from either side's switch-in
 * ability (Drought, Orichalcum Pulse, Electric Surge, …) so damage that
 * depends on the summoned field calculates correctly. Earlier abilities in
 * the list win a slot. */
export function autoField(
  fieldOpts: rr.FieldOptions,
  abilities: (string | undefined)[],
): rr.FieldOptions {
  let { weather, terrain } = fieldOpts;
  for (const a of abilities) {
    weather = weather || weatherFromAbility(a);
    terrain = terrain || terrainFromAbility(a);
  }
  return { ...fieldOpts, weather, terrain };
}

/** the "Sun (Drought)" / "Electric Terrain (Electric Surge)" note bits for
 * whichever weather/terrain came from a switch-in ability rather than a
 * manual pick — shared by the calc and both readiness matrix tabs, which
 * each pass every ability in play (both sides) and only need the note text,
 * not the field itself (that's `autoField`, applied per attacker/defender
 * pair since different pairs can have different fields) */
export function autoFieldNote(
  fieldOpts: rr.FieldOptions,
  abilities: (string | undefined)[],
): string[] {
  const bits = new Set<string>();
  if (!fieldOpts.weather) {
    for (const a of abilities) {
      const w = weatherFromAbility(a);
      if (w) bits.add(`${w} (${a})`);
    }
  }
  if (!fieldOpts.terrain) {
    for (const a of abilities) {
      const t = terrainFromAbility(a);
      if (t) bits.add(`${t} Terrain (${a})`);
    }
  }
  return [...bits];
}

export interface PlayerMonConfig {
  species: string;
  level: number;
  nature: string;
  ability: string;
  item: string;
  evs: Record<string, number>;
  ivs?: Record<string, number>;
  /** in-battle stat stages, -6..+6 */
  boosts?: Record<string, number>;
  /** engine status code ("brn", "par", …), "" = healthy */
  status?: string;
  moves: string[];
  /** per move-slot: a pinned hit count for a multi-hit move (e.g. 4 or 5 to
   * check Loaded Dice/Skill Link), matched by index to `moves`. undefined
   * (or a slot with no entry) means "show the full possible range" */
  moveHits?: (number | undefined)[];
  /** HP this Pokémon starts a matchup at, as a percent of its max HP —
   * lets a damaged mon's results be checked without editing its actual HP
   * total. undefined means full HP (100); never stored as literally 100 */
  currentHpPercent?: number;
}

/** status conditions the engine models (burn/frostbite damage halving,
 * paralysis speed, Hex/Facade/Venoshock power). RR replaces freeze with
 * frostbite, and the fork's "frz" implements exactly that. */
export const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "Healthy" },
  { value: "brn", label: "Burned" },
  { value: "par", label: "Paralyzed" },
  { value: "psn", label: "Poisoned" },
  { value: "tox", label: "Badly Poisoned" },
  { value: "slp", label: "Asleep" },
  { value: "frz", label: "Frostbitten" },
];

export const BOOST_STATS = ["ATK", "DEF", "SPA", "SPD", "SPE"] as const;

/** the field state this app exposes per side — hazards, screens, Leech Seed,
 * Tailwind. Only affects move damage (via the engine) and Speed (Tailwind);
 * it does not change the raw stat totals shown in the totals grid. */
export interface SideConditions {
  stealthRock?: boolean;
  /** 0-3 layers */
  spikes?: number;
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
  tailwind?: boolean;
  leechSeed?: boolean;
}

export function toEngineSide(s?: SideConditions): rr.SideOptions {
  if (!s) return {};
  return {
    isSR: s.stealthRock,
    spikes: s.spikes,
    isReflect: s.reflect,
    isLightScreen: s.lightScreen,
    isAuroraVeil: s.auroraVeil,
    isTailwind: s.tailwind,
    isSeeded: s.leechSeed,
  };
}

export const stageMult = (n: number) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));

/** stat multipliers granted by a held item (display + totals) */
export function itemStatMods(
  item: string,
  speciesName: string,
  nfe: boolean,
): Partial<Record<string, number>> {
  switch (rr.toID(item || "")) {
    case "choiceband": return { ATK: 1.5 };
    case "choicespecs": return { SPA: 1.5 };
    case "choicescarf": return { SPE: 1.5 };
    case "assaultvest": return { SPD: 1.5 };
    case "eviolite": return nfe ? { DEF: 1.5, SPD: 1.5 } : {};
    case "ironball": return { SPE: 0.5 };
    case "lightball":
      return speciesName.startsWith("Pikachu") ? { ATK: 2, SPA: 2 } : {};
    case "thickclub":
      return /^(Cubone|Marowak)/.test(speciesName) ? { ATK: 2 } : {};
    case "deepseatooth":
      return speciesName === "Clamperl" ? { SPA: 2 } : {};
    case "deepseascale":
      return speciesName === "Clamperl" ? { SPD: 2 } : {};
    default: return {};
  }
}

/** stat multipliers granted by an ability under the given field */
export function abilityStatMods(
  ability: string,
  item: string,
  fieldOpts: rr.FieldOptions,
  stats: Record<string, number>,
): Partial<Record<string, number>> {
  const id = rr.toID(ability || "");
  if (id === "hugepower" || id === "purepower") return { ATK: 2 };
  if (id === "hustle" || id === "gorillatactics") return { ATK: 1.5 };
  if (id === "furcoat") return { DEF: 2 };
  const booster = rr.toID(item || "") === "boosterenergy";
  const active =
    (id === "protosynthesis" && (fieldOpts.weather === "Sun" || booster)) ||
    (id === "quarkdrive" && (fieldOpts.terrain === "Electric" || booster));
  if (active) {
    // boosts the holder's highest non-HP stat
    let best = "ATK";
    for (const k of BOOST_STATS) {
      if ((stats[k] ?? 0) > (stats[best] ?? 0)) best = k;
    }
    return { [best]: best === "SPE" ? 1.5 : 1.3 };
  }
  return {};
}

export interface StatTotals {
  itemMods: Partial<Record<string, number>>;
  abilityMods: Partial<Record<string, number>>;
  totals: Record<string, number>;
}

/** battle-effective stats: nature/EV/IV stats with item, ability, boost
 * stages and field applied. Speed uses the engine's getFinalSpeed. */
export function statTotals(
  cfg: PlayerMonConfig,
  fieldOpts: rr.FieldOptions,
  side?: SideConditions,
): StatTotals | null {
  const pokemon = buildPlayerPokemon(cfg);
  const speciesName = resolveSpecies(cfg.species);
  if (!pokemon || !speciesName) return null;
  const nfe = !!gen.species.get(rr.toID(speciesName))?.nfe;
  const base = computedStats(cfg);
  if (!base) return null;
  const itemMods = itemStatMods(cfg.item, speciesName, nfe);
  const abilityMods = abilityStatMods(cfg.ability, cfg.item, fieldOpts, base);
  const totals: Record<string, number> = { HP: base.HP };
  for (const k of BOOST_STATS) {
    if (k === "SPE") {
      totals[k] = effectiveSpeed(pokemon, fieldOpts, side);
      continue;
    }
    let v = Math.floor(base[k] * stageMult(cfg.boosts?.[k] ?? 0));
    if (itemMods[k]) v = Math.floor(v * itemMods[k]!);
    if (abilityMods[k]) v = Math.floor(v * abilityMods[k]!);
    totals[k] = v;
  }
  return { itemMods, abilityMods, totals };
}

/** display stats for a boss mon: nature/EV stats at the given level with
 * item and ability multipliers, stage boosts and effective speed applied —
 * the numbers it actually fights with, not the species' base line */
export function bossStatTotals(
  mon: BossMon,
  level: number,
  boosts?: Record<string, number>,
  fieldOpts: rr.FieldOptions = {},
  status?: string,
  ivs?: Record<string, number>,
  side?: SideConditions,
): Record<string, number> | null {
  const poke = buildBossPokemon(mon, level, boosts, status, ivs);
  const speciesName = resolveSpecies(mon.species);
  if (!poke || !speciesName) return null;
  const s = poke.stats;
  const base: Record<string, number> = {
    HP: s.hp,
    ATK: s.atk,
    DEF: s.def,
    SPA: s.spa,
    SPD: s.spd,
    SPE: s.spe,
  };
  const nfe = !!gen.species.get(rr.toID(speciesName))?.nfe;
  const itemMods = itemStatMods(mon.item, speciesName, nfe);
  const abilityMods = abilityStatMods(mon.ability, mon.item, fieldOpts, base);
  const totals: Record<string, number> = { HP: base.HP };
  for (const k of BOOST_STATS) {
    if (k === "SPE") {
      totals[k] = effectiveSpeed(poke, fieldOpts, side);
      continue;
    }
    let v = Math.floor(base[k] * stageMult(boosts?.[k] ?? 0));
    if (itemMods[k]) v = Math.floor(v * itemMods[k]!);
    if (abilityMods[k]) v = Math.floor(v * abilityMods[k]!);
    totals[k] = v;
  }
  return totals;
}

/** stat raised / lowered by each nature (neutral natures omitted) */
export const NATURE_EFFECTS: Record<string, { plus: string; minus: string }> = {
  Adamant: { plus: "ATK", minus: "SPA" },
  Bold: { plus: "DEF", minus: "ATK" },
  Brave: { plus: "ATK", minus: "SPE" },
  Calm: { plus: "SPD", minus: "ATK" },
  Careful: { plus: "SPD", minus: "SPA" },
  Gentle: { plus: "SPD", minus: "DEF" },
  Hasty: { plus: "SPE", minus: "DEF" },
  Impish: { plus: "DEF", minus: "SPA" },
  Jolly: { plus: "SPE", minus: "SPA" },
  Lax: { plus: "DEF", minus: "SPD" },
  Lonely: { plus: "ATK", minus: "DEF" },
  Mild: { plus: "SPA", minus: "DEF" },
  Modest: { plus: "SPA", minus: "ATK" },
  Naive: { plus: "SPE", minus: "SPD" },
  Naughty: { plus: "ATK", minus: "SPD" },
  Quiet: { plus: "SPA", minus: "SPE" },
  Rash: { plus: "SPA", minus: "SPD" },
  Relaxed: { plus: "DEF", minus: "SPE" },
  Sassy: { plus: "SPD", minus: "SPE" },
  Timid: { plus: "SPE", minus: "ATK" },
};

/** actual computed stats (level/nature/EVs/IVs applied), keyed by label */
export function computedStats(cfg: PlayerMonConfig): Record<string, number> | null {
  const p = buildPlayerPokemon(cfg);
  if (!p) return null;
  const s = p.stats;
  return { HP: s.hp, ATK: s.atk, DEF: s.def, SPA: s.spa, SPD: s.spd, SPE: s.spe };
}

export interface MatchupLine {
  move: string;
  desc: string;
  minPercent: number;
  maxPercent: number;
  /** set when an otherwise-lethal hit is survived at 1 HP ("Sturdy"/"Focus Sash") */
  guard?: string;
  error?: string;
  /** present when the move's hit count is genuinely ambiguous (Fury Attack,
   * Bullet Seed, …) — [min, max] hits selectable for it */
  hitsRange?: [number, number];
  /** which move-config slot (0-3) this line came from, for hitsRange's
   * picker to write back to — absent for calcMoves callers that don't need
   * a picker (the array position isn't reliable once lines get sorted) */
  slotIndex?: number;
  /** the hit count this line was actually calculated at, when the user
   * pinned one via the picker; undefined means "auto" */
  pinnedHits?: number;
  /** what "auto" actually resolved to and why, when it's narrower than the
   * move's full hitsRange — Skill Link (always max hits) or Loaded Dice
   * (only ever 4-5 of a 2-5 move) detected off the attacker. Absent when
   * pinnedHits is set (an explicit pin always wins) or neither applies */
  autoRange?: [number, number];
  autoNote?: string;
}

const MOLD_BREAKERS = new Set(["Mold Breaker", "Teravolt", "Turboblaze"]);

/** abilities that add a follow-up strike to single-hit moves (the engine
 * models their damage); the extra hit finishes a Sturdy/Sash survivor */
const MULTI_STRIKE_ABILITIES = ["Parental Bond"];

/** [min, max] hits a move's hit count is genuinely ambiguous over — e.g.
 * Fury Attack is [2, 5]. null when there's nothing to pick: not a multi-hit
 * move, or a fixed-count one (Bonemerang, Twineedle, …) the engine always
 * resolves to the same number regardless of what's passed in. Moves with
 * multiaccuracy (Triple Kick, Population Bomb, …) can stop early on a miss,
 * so their range starts at 1 hit even though the doc "multihit" is a single
 * number (the guaranteed-hits cap, not the count) */
export function multihitRange(moveName: string): [number, number] | null {
  const data = gen.moves.get(rr.toID(moveName));
  const mh = data?.multihit;
  if (mh === undefined) return null;
  if (typeof mh === "number") {
    return data?.multiaccuracy ? [1, mh] : null;
  }
  return mh[0] === mh[1] ? null : [mh[0], mh[1]];
}

/** narrows a multi-hit range for what the attacker's ability/item
 * guarantees, when neither is overridden by an explicit pin: Skill Link
 * always maxes out the hit count, Loaded Dice only ever rolls the top two
 * (a 2-5 move becomes 4-5) */
function autoHitsNarrowing(
  attacker: rr.Pokemon,
  range: [number, number],
): { range: [number, number]; note?: string } {
  if (attacker.hasAbility("Skill Link")) {
    return { range: [range[1], range[1]], note: "Skill Link" };
  }
  if (attacker.hasItem("Loaded Dice")) {
    return { range: [Math.max(range[0], range[1] - 1), range[1]], note: "Loaded Dice" };
  }
  return { range };
}

/** "Sturdy" / "Focus Sash" when the defender survives an otherwise-lethal
 * single hit from full HP; multi-hit moves and multi-strike abilities break
 * through, Mold Breaker ignores Sturdy but not the sash */
function ohkoGuard(
  attacker: rr.Pokemon,
  defender: rr.Pokemon,
  move: rr.Move,
): string | undefined {
  if ((move.hits ?? 1) > 1) return undefined;
  if (attacker.hasAbility(...MULTI_STRIKE_ABILITIES)) return undefined;
  if (
    defender.hasAbility("Sturdy") &&
    !MOLD_BREAKERS.has(attacker.ability ?? "")
  ) {
    return "Sturdy";
  }
  if (defender.hasItem("Focus Sash")) return "Focus Sash";
  return undefined;
}

/** "Highest Lv -3" / "Player Max Level" style boss levels scale off the
 * player's highest level — at cap play that's the level cap. */
export function defaultBossLevel(level: string, levelCap?: number): number {
  const n = parseInt(level, 10);
  if (!Number.isNaN(n)) return n;
  if (levelCap) {
    const m = level.match(/-\s*(\d+)/);
    return levelCap - (m ? parseInt(m[1], 10) : 0);
  }
  return 50;
}

export interface MoveRange {
  move: string;
  minPercent: number;
  maxPercent: number;
  /** set when an otherwise-lethal hit is survived at 1 HP ("Sturdy"/"Focus Sash") */
  guard?: string;
  error?: string;
}

/** min–max damage of one move as % of the defender's max HP */
export function calcMoveRange(
  attacker: rr.Pokemon,
  defender: rr.Pokemon,
  docMove: string,
  fieldOpts: rr.FieldOptions,
  isCrit = false,
): MoveRange | null {
  const moveName = resolveMove(docMove);
  if (!moveName) {
    if (!docMove || docMove === "-") return null;
    return { move: docMove, minPercent: 0, maxPercent: 0, error: "unknown move" };
  }
  try {
    const move = new rr.Move(GEN, moveName, { isCrit });
    const result = rr.calculate(GEN, attacker, defender, move, new rr.Field(fieldOpts));
    const [min, max] = result.range();
    const hp = defender.maxHP();
    const maxPercent = Math.round((max / hp) * 1000) / 10;
    return {
      move: moveName,
      minPercent: Math.round((min / hp) * 1000) / 10,
      maxPercent,
      guard: maxPercent >= 100 ? ohkoGuard(attacker, defender, move) : undefined,
    };
  } catch {
    return { move: moveName, minPercent: 0, maxPercent: 0, error: "calc failed" };
  }
}

const EV_KEYS: Record<string, keyof rr.StatsTable> = {
  HP: "hp", ATK: "atk", DEF: "def", SPA: "spa", SPD: "spd", SPE: "spe",
};

function bossEvs(mon: BossMon): rr.StatsTable {
  const evs: rr.StatsTable = {};
  for (const [k, v] of Object.entries(mon.evs)) {
    const key = EV_KEYS[k];
    const n = parseInt(v, 10);
    if (key && !Number.isNaN(n)) evs[key] = n;
  }
  return evs;
}

/** case-insensitive prefix lookup against the engine's own item list */
function resolveItemName(item: string): string {
  const hit = ITEM_NAMES.find((n) => n.toLowerCase() === item.toLowerCase());
  if (hit) return hit;
  const stripped = item.replace(/\.$/, "");
  return ITEM_NAMES.find((n) => n.toLowerCase().startsWith(stripped.toLowerCase())) ?? item;
}

/** the docs abbreviate long item names with a trailing dot ("Weakness
 * Pol.", "Terrain Exten."/"Terrain Extend.") — an unresolved name reaches
 * the engine's item table as a miss, and at least one internal check
 * (Knock Off's mega-stone guard) assumes the lookup always succeeds and
 * throws on a miss, silently failing every calc against that Pokémon */
function cleanItem(item: string): string | undefined {
  if (!item || item === "-" || /no item/i.test(item)) return undefined;
  return item.endsWith(".") ? resolveItemName(item) : item;
}

export function buildBossPokemon(
  mon: BossMon,
  level: number,
  boostsIn?: Record<string, number>,
  status?: string,
  ivsIn?: Record<string, number>,
): rr.Pokemon | null {
  const species = resolveSpecies(mon.species);
  if (!species) return null;
  const boosts: rr.StatsTable = {};
  for (const [k, v] of Object.entries(boostsIn ?? {})) {
    const key = EV_KEYS[k];
    if (key && v !== 0) boosts[key] = Math.max(-6, Math.min(6, v));
  }
  // the docs don't publish boss IVs — the engine already defaults any unset
  // stat to a flat 31, same as a player mon with no IV spread entered
  const ivs: rr.StatsTable = {};
  for (const [k, v] of Object.entries(ivsIn ?? {})) {
    const key = EV_KEYS[k];
    if (key) ivs[key] = Math.max(0, Math.min(31, v));
  }
  try {
    return new rr.Pokemon(GEN, species, {
      level,
      nature: NATURES.includes(mon.nature) ? mon.nature : undefined,
      ability: mon.ability || undefined,
      item: cleanItem(mon.item),
      evs: bossEvs(mon),
      ivs,
      boosts,
      status: status || "",
    });
  } catch {
    return null;
  }
}

export function buildPlayerPokemon(cfg: PlayerMonConfig): rr.Pokemon | null {
  const species = resolveSpecies(cfg.species);
  if (!species) return null;
  const evs: rr.StatsTable = {};
  for (const [k, v] of Object.entries(cfg.evs)) {
    const key = EV_KEYS[k];
    if (key && v > 0) evs[key] = v;
  }
  const ivs: rr.StatsTable = {};
  for (const [k, v] of Object.entries(cfg.ivs ?? {})) {
    const key = EV_KEYS[k];
    if (key) ivs[key] = Math.max(0, Math.min(31, v));
  }
  const boosts: rr.StatsTable = {};
  for (const [k, v] of Object.entries(cfg.boosts ?? {})) {
    const key = EV_KEYS[k];
    if (key && v !== 0) boosts[key] = Math.max(-6, Math.min(6, v));
  }
  try {
    return new rr.Pokemon(GEN, species, {
      level: cfg.level,
      nature: cfg.nature || undefined,
      ability: cfg.ability || undefined,
      item: cleanItem(cfg.item),
      evs,
      ivs,
      boosts,
      status: cfg.status || "",
    });
  } catch {
    return null;
  }
}

/** effective speed with item (Choice Scarf, Iron Ball), ability, field
 * (Swift Swim in rain etc.) and this Pokemon's own side (Tailwind) applied —
 * Pokemon.stats.spe alone ignores all of these */
export function effectiveSpeed(
  pokemon: rr.Pokemon,
  fieldOpts: rr.FieldOptions,
  side?: SideConditions,
): number {
  try {
    const field = new rr.Field(fieldOpts);
    return getFinalSpeed(gen, pokemon, field, toEngineSide(side));
  } catch {
    return pokemon.stats.spe;
  }
}

export function calcMoves(
  attacker: rr.Pokemon,
  defender: rr.Pokemon,
  moves: { name: string; hits?: number; slotIndex?: number }[],
  fieldOpts: rr.FieldOptions,
  isCrit = false,
): MatchupLine[] {
  const lines: MatchupLine[] = [];
  for (const { name: docMove, hits: pinnedHits, slotIndex } of moves) {
    const moveName = resolveMove(docMove);
    if (!moveName) {
      if (docMove && docMove !== "-")
        lines.push({ move: docMove, desc: "", minPercent: 0, maxPercent: 0, error: "unknown move" });
      continue;
    }
    try {
      const range = multihitRange(moveName);
      // no pinned hit count on a genuinely-ambiguous multi-hit move: show
      // the true range (fewest hits' low roll to most hits' high roll),
      // narrowed by Skill Link/Loaded Dice when the attacker has one and
      // nothing's explicitly pinned — not the engine's own single
      // silently-guessed hit count
      let autoRange: [number, number] | undefined;
      let autoNote: string | undefined;
      if (range && pinnedHits === undefined) {
        const auto = autoHitsNarrowing(attacker, range);
        if (auto.note) {
          autoRange = auto.range;
          autoNote = auto.note;
        }
      }
      const runAt = range && pinnedHits === undefined ? (autoRange ?? range) : undefined;
      const hitsForCalc = pinnedHits ?? runAt?.[1] ?? range?.[1];

      const move = new rr.Move(GEN, moveName, { isCrit, hits: hitsForCalc });
      const result = rr.calculate(GEN, attacker, defender, move, new rr.Field(fieldOpts));
      let [min, max] = result.range();
      let desc: string;
      if (runAt) {
        const loMove = new rr.Move(GEN, moveName, { isCrit, hits: runAt[0] });
        const [loMin] = rr.calculate(GEN, attacker, defender, loMove, new rr.Field(fieldOpts)).range();
        min = loMin;
      }
      const hp = defender.maxHP();
      const maxPercent = Math.round((max / hp) * 1000) / 10;
      try {
        desc = result.desc();
      } catch {
        // desc() throws when there's no damage: status moves, or immunity
        desc = move.category === "Status" ? "status move" : "no damage (immune)";
      }
      lines.push({
        move: moveName,
        desc,
        minPercent: Math.round((min / hp) * 1000) / 10,
        maxPercent,
        guard: maxPercent >= 100 ? ohkoGuard(attacker, defender, move) : undefined,
        hitsRange: range ?? undefined,
        slotIndex,
        pinnedHits,
        autoRange,
        autoNote,
      });
    } catch {
      lines.push({ move: moveName, desc: "", minPercent: 0, maxPercent: 0, error: "calc failed" });
    }
  }
  return lines.sort((a, b) => b.maxPercent - a.maxPercent);
}
