/** Radical Red's ability randomizer, which is the reason a randomized run's
 * abilities are knowable at all.
 *
 * The game does not store a Pokémon's ability anywhere — not in the save, not
 * in a species table. It recomputes it every time from the trainer id, the
 * species and the base ability, which is why two Pokémon of the same species
 * always share an ability in a randomized run, and why the RR dex site can
 * show a run's real abilities from nothing but an uploaded save. The hash is
 * a pure function, so it answers for the whole dex just as cheaply as for one
 * Pokémon (all 1247 species in ~2ms).
 *
 * Split out of saveImport.ts so the Reference tab's Pokédex can use it
 * without pulling the whole .sav reader into its chunk.
 */

import type { Run } from "../types";
import abilityIdsJson from "../data/abilityIds.json";
import { SAVE_FILE_FEATURE } from "./featureFlags";

/** the abilities the randomizer is allowed to pick from — game data, not
 * ours: the normal pool drops 19 form-changing abilities like Wonder Guard
 * and Disguise, the restricted pool drops 29 more powerful ones for hardcore.
 * Taken from hzla's Dynamic-Calc-Decomps, which declares no licence — they
 * are lists of ids extracted from the ROM rather than authored work, but the
 * source deserves the credit and this is the one thing here not derived from
 * our own data. https://github.com/hzla/Dynamic-Calc-Decomps */
const NORMAL_ABILITY_POOL = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,26,27,28,29,30,31,32,33,34,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,60,61,62,63,64,65,66,67,68,69,70,71,72,73,75,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,157,158,160,161,162,163,166,167,169,171,172,173,175,176,177,178,179,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,206,207,208,209,210,212,213,214,215,216,217,218,220,221,222,223,224,225,226,227,228,229,230,231,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,251,252,74,254,255,253];
const RESTRICTED_ABILITY_POOL = [1,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,26,27,28,29,30,31,32,33,34,37,38,39,40,41,42,43,44,46,47,48,49,50,51,52,53,54,55,56,57,58,60,61,62,63,64,65,66,67,68,69,70,71,72,73,75,77,78,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,112,113,114,115,116,119,121,122,123,124,125,126,127,128,129,130,132,133,135,136,137,138,139,140,141,144,145,146,147,148,149,150,151,152,153,154,158,160,161,162,163,166,167,169,171,175,177,178,179,185,186,187,188,189,190,192,193,194,195,196,198,199,200,201,202,203,204,206,208,209,210,215,216,217,218,220,221,222,223,224,225,226,227,228,229,230,231,233,234,235,236,237,238,239,240,241,242,243,244,245,246,248,249,251,74,254,255,253];

export const abilityNames = (abilityIdsJson as { names: Record<string, string> }).names;
/** dex species id -> the three ability ids in the GAME's slot order; slot 2
 * is the hidden ability, and 0 means the species has nothing in that slot */
export const abilitySlotsBySpecies = (abilityIdsJson as {
  bySpeciesId: Record<string, number[]>;
}).bySpeciesId;

/** the exact hash Radical Red uses. Ported from the reference implementation;
 * every step matters, including the `> length` comparison (not `>=`) and the
 * 0xFFFF masks, which is why it is written out rather than tidied. */
export function randomizedAbilityId(
  trainerId: number,
  restricted: boolean,
  abilityId: number,
  speciesId: number,
): number {
  if (!abilityId) return 0;
  const tid = Math.max(1, trainerId) >>> 0;
  const pool = restricted ? RESTRICTED_ABILITY_POOL : NORMAL_ABILITY_POOL;
  const n = pool.length;
  if (!n) return abilityId;
  const secret = ((tid >>> 16) & 0xffff) % 0xff;
  let i = (tid & 0xffff) % n;
  i = (i + speciesId + abilityId) & 0xffff;
  if (i > n) i = (i - n + 2) & 0xffff;
  i = (i ^ (secret & 0xffff)) % n;
  return pool[i] >>> 0;
}

/** rolls one species' base ability into what this run actually gives it */
export type AbilityRoll = (speciesId: number, baseAbilityId: number) => number;

/** the run's ability roll, or null when its abilities are just the dex's.
 *
 * Deliberately narrower than `abilitiesRandomized()`: that one is also true
 * for the manual Routes toggle, which frees the ability *inputs* but tells us
 * nothing about the mapping. Only an imported save carries the trainer id the
 * hash needs, so a manually-flagged run correctly gets null here. */
export function abilityRollFor(run: Run | null | undefined): AbilityRoll | null {
  const info = run?.saveInfo;
  if (!SAVE_FILE_FEATURE || !info?.random.abilities || !info.trainedId) return null;
  return (speciesId, baseAbilityId) =>
    randomizedAbilityId(info.trainedId, info.restricted, baseAbilityId, speciesId);
}
