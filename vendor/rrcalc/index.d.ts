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
}

export class Pokemon {
  constructor(gen: number | Generation, name: string, options?: PokemonOptions);
  maxHP(): number;
  species: { baseStats: Required<StatsTable> };
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
}

export interface FieldOptions {
  weather?: string;
  terrain?: string;
  gameType?: string;
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
}

export interface Generation {
  species: { get(id: string): { name: string; baseStats: Required<StatsTable>; nfe?: boolean } | undefined } & Iterable<{ name: string }>;
  moves: { get(id: string): { name: string } | undefined } & Iterable<{ name: string }>;
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
