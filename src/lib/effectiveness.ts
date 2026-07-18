import typesJson from "../data/types.json";

const data = typesJson as unknown as {
  colors: Record<string, string>;
  matchup: Record<string, Record<string, number>>;
  species: Record<string, string[]>;
  stats: Record<string, Record<string, number>>;
};

export const STAT_KEYS = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** RR base stats for a docs species name (empty if unknown). */
export function statsFor(species: string): Partial<Record<StatKey, number>> {
  return data.stats[species] ?? {};
}

export const ALL_TYPES = Object.keys(data.matchup);

/** Damage-taken modifiers from common defensive abilities. 0 = immunity. */
const ABILITY_MODS: Record<string, Record<string, number>> = {
  Levitate: { Ground: 0 },
  "Earth Eater": { Ground: 0 },
  "Water Absorb": { Water: 0 },
  "Storm Drain": { Water: 0 },
  "Dry Skin": { Water: 0 },
  "Volt Absorb": { Electric: 0 },
  "Lightning Rod": { Electric: 0 },
  "Motor Drive": { Electric: 0 },
  "Flash Fire": { Fire: 0 },
  "Well-Baked Body": { Fire: 0 },
  "Sap Sipper": { Grass: 0 },
  "Thick Fat": { Fire: 0.5, Ice: 0.5 },
  Heatproof: { Fire: 0.5 },
  "Purifying Salt": { Ghost: 0.5 },
  Fluffy: { Fire: 2 },
};

/** attacking type -> damage multiplier vs this species (only non-neutral). */
export function defensiveProfile(
  species: string,
  ability?: string,
): Record<string, number> {
  const defTypes = data.species[species];
  if (!defTypes) return {};
  const mods = ability ? ABILITY_MODS[ability] : undefined;
  const out: Record<string, number> = {};
  for (const atk of ALL_TYPES) {
    let m = 1;
    for (const d of defTypes) m *= data.matchup[atk][d] ?? 1;
    if (mods && atk in mods) m = mods[atk] === 0 ? 0 : m * mods[atk];
    if (m !== 1) out[atk] = m;
  }
  return out;
}

export function typeColor(type: string): string {
  return data.colors[type] ?? "#666";
}

export function formatMult(m: number): string {
  if (m === 0) return "×0";
  if (m === 0.25) return "×¼";
  if (m === 0.5) return "×½";
  return `×${m}`;
}
