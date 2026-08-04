/* Minimal typings for the vendored RR damage-calc engine (@smogon/calc fork). */

export interface StatsTable {
  hp?: number;
  atk?: number;
  def?: number;
  spa?: number;
  spd?: number;
  spe?: number;
}

export interface PokemonOptions {
  level?: number;
  ability?: string;
  item?: string;
  nature?: string;
  evs?: StatsTable;
  ivs?: StatsTable;
  boosts?: StatsTable;
  /** "brn" | "par" | "psn" | "tox" | "slp" | "frz" ("" = healthy) */
  status?: string;
  /** Which stat Protosynthesis/Quark Drive boosts. "auto" = whichever is
   * highest, which is what the game does. Leaving it undefined does NOT
   * mean "auto" — `isQPActive` (mechanics/util.js) returns false outright
   * when it is unset, so both abilities are silently inert. */
  boostedStat?: "auto" | "atk" | "def" | "spa" | "spd" | "spe";
}

export class Pokemon {
  constructor(gen: number | Generation, name: string, options?: PokemonOptions);
  maxHP(): number;
  /** `species.types` is what the constructor copies `types` from, and what
   * clone() feeds back through `overrides`; the mechanics read `types`.
   * Both are writable, and a typing override has to set both. */
  species: { baseStats: Required<StatsTable>; types: string[] };
  types: string[];
  stats: Required<StatsTable>;
  rawStats: Required<StatsTable>;
  ability?: string;
  item?: string;
  hasAbility(...names: string[]): boolean;
  hasItem(...names: string[]): boolean;
}

export class Move {
  constructor(gen: number | Generation, name: string, options?: Record<string, unknown>);
  hits: number;
  category: "Physical" | "Special" | "Status";
}

/** per-side battle state (hazards, screens, Leech Seed, Tailwind, ...) —
 * only the subset this app surfaces is typed here; the engine's Side class
 * (vendor/rrcalc/field.js) supports more (Helping Hand, Battery, ...) */
export interface SideOptions {
  spikes?: number;
  isSR?: boolean;
  isReflect?: boolean;
  isLightScreen?: boolean;
  isAuroraVeil?: boolean;
  isSeeded?: boolean;
  isTailwind?: boolean;
}

export interface FieldOptions {
  weather?: string;
  terrain?: string;
  gameType?: string;
  attackerSide?: SideOptions;
  defenderSide?: SideOptions;
}

export class Field {
  constructor(options?: FieldOptions);
}

export interface Result {
  damage: number | number[];
  desc(): string;
  range(): [number, number];
  defender: Pokemon;
  attacker: Pokemon;
  /** the engine's own description fields. Only the ones that actually
   * mattered get set, which is what lets us tell a terrain- or
   * ability-blocked hit apart from a plain type immunity (see
   * zeroDamageReason) — desc() itself just throws on 0 damage. */
  rawDesc: {
    terrain?: string;
    defenderAbility?: string;
    defenderItem?: string;
  };
}

export interface Generation {
  species: { get(id: string): { name: string; baseStats: Required<StatsTable>; nfe?: boolean; baseSpecies?: string; otherFormes?: string[]; types?: string[] } | undefined } & Iterable<{ name: string }>;
  moves: {
    get(id: string): {
      name: string;
      multihit?: number | [number, number];
      multiaccuracy?: boolean;
    } | undefined;
  } & Iterable<{ name: string }>;
  natures: Iterable<{ name: string }>;
}

export const Generations: { get(n: number): Generation };

/** per-generation name lists (index = gen number) */
export const ITEMS: Record<number, string[]>;
export const ABILITIES: Record<number, string[]>;

export function calculate(
  gen: number | Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field?: Field,
): Result;

export function toID(text: string): string;

export function calcStat(
  gen: number | Generation,
  stat: string,
  base: number,
  iv: number,
  ev: number,
  level: number,
  nature?: string,
): number;
