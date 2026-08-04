import type { Field, Generation, Pokemon } from "../index";

/** effective speed including item (Choice Scarf, Iron Ball), ability
 * (Swift Swim etc. under the given field), status and side conditions */
export function getFinalSpeed(
  gen: Generation,
  pokemon: Pokemon,
  field: Field,
  side: unknown,
): number;

/** whether Protosynthesis/Quark Drive is currently boosting this Pokémon.
 * Returns false outright when `pokemon.boostedStat` is unset, before any
 * weather/terrain/Booster Energy check — see PokemonOptions.boostedStat. */
export function isQPActive(pokemon: Pokemon, field: Field): boolean;

/** the stat that boost applies to: `boostedStat` when it names one, else
 * whichever of atk/def/spa/spd/spe is highest after boosts */
export function getQPBoostedStat(
  pokemon: Pokemon,
  gen?: Generation,
): "atk" | "def" | "spa" | "spd" | "spe";
