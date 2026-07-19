/** Adapter around the vendored RR damage-calc engine.
 * Gen 9 in the vendored data set carries the Radical Red changes. */

import * as rr from "rr-damage-calc";
import type { BossMon } from "../types";

export const GEN = 9;
const gen = rr.Generations.get(GEN);

export const NATURES = [
  "Adamant", "Bashful", "Bold", "Brave", "Calm", "Careful", "Docile",
  "Gentle", "Hardy", "Hasty", "Impish", "Jolly", "Lax", "Lonely", "Mild",
  "Modest", "Naive", "Naughty", "Quiet", "Quirky", "Rash", "Relaxed",
  "Sassy", "Serious", "Timid",
];

/** item and ability name lists from the calc data, for pickers */
export const ITEM_NAMES: string[] = [...(rr.ITEMS[GEN] ?? [])].sort();
export const ABILITY_NAMES: string[] = [...(rr.ABILITIES[GEN] ?? [])].sort();

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
};

const SUFFIXES: Record<string, string> = { a: "-Alola", g: "-Galar", h: "-Hisui" };

/** docs species name -> calc species name, or null when the calc data
 * doesn't know it (never guess a wrong mon). */
export function resolveSpecies(docName: string): string | null {
  const lower = docName.toLowerCase().trim();
  const candidates = [docName, ALIASES[lower] ?? ""];
  const m = lower.match(/^(.*)-(\w)$/);
  if (m && SUFFIXES[m[2]]) candidates.push(m[1] + SUFFIXES[m[2]]);
  for (const cand of candidates) {
    if (!cand) continue;
    const hit = gen.species.get(rr.toID(cand));
    if (hit) return hit.name;
  }
  return null;
}

export function resolveMove(docMove: string): string | null {
  let name = docMove.trim();
  if (name === "-" || !name) return null;
  if (/^HP /i.test(name)) name = "Hidden Power " + name.slice(3);
  const hit = gen.moves.get(rr.toID(name));
  return hit ? hit.name : null;
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

export interface PlayerMonConfig {
  species: string;
  level: number;
  nature: string;
  ability: string;
  item: string;
  evs: Record<string, number>;
  ivs?: Record<string, number>;
  moves: string[];
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
  maxPercent: number;
  error?: string;
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

function cleanItem(item: string): string | undefined {
  if (!item || item === "-" || /no item/i.test(item)) return undefined;
  return item;
}

export function buildBossPokemon(mon: BossMon, level: number): rr.Pokemon | null {
  const species = resolveSpecies(mon.species);
  if (!species) return null;
  try {
    return new rr.Pokemon(GEN, species, {
      level,
      nature: NATURES.includes(mon.nature) ? mon.nature : undefined,
      ability: mon.ability || undefined,
      item: cleanItem(mon.item),
      evs: bossEvs(mon),
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
  try {
    return new rr.Pokemon(GEN, species, {
      level: cfg.level,
      nature: cfg.nature || undefined,
      ability: cfg.ability || undefined,
      item: cleanItem(cfg.item),
      evs,
      ivs,
    });
  } catch {
    return null;
  }
}

export function calcMoves(
  attacker: rr.Pokemon,
  defender: rr.Pokemon,
  moves: string[],
  fieldOpts: rr.FieldOptions,
): MatchupLine[] {
  const lines: MatchupLine[] = [];
  for (const docMove of moves) {
    const moveName = resolveMove(docMove);
    if (!moveName) {
      if (docMove && docMove !== "-")
        lines.push({ move: docMove, desc: "", maxPercent: 0, error: "unknown move" });
      continue;
    }
    try {
      const result = rr.calculate(
        GEN,
        attacker,
        defender,
        new rr.Move(GEN, moveName),
        new rr.Field(fieldOpts),
      );
      const [, max] = result.range();
      const maxPercent = Math.round((max / defender.maxHP()) * 1000) / 10;
      let desc: string;
      try {
        desc = result.desc();
      } catch {
        // desc() throws for pure status moves
        desc = "status move";
      }
      lines.push({ move: moveName, desc, maxPercent });
    } catch {
      lines.push({ move: moveName, desc: "", maxPercent: 0, error: "calc failed" });
    }
  }
  return lines.sort((a, b) => b.maxPercent - a.maxPercent);
}
