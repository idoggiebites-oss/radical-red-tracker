import type { Field, Generation, Pokemon } from "../index";

/** effective speed including item (Choice Scarf, Iron Ball), ability
 * (Swift Swim etc. under the given field), status and side conditions */
export function getFinalSpeed(
  gen: Generation,
  pokemon: Pokemon,
  field: Field,
  side: unknown,
): number;
