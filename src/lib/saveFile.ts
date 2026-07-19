/** Radical Red .sav reader.
 *
 * Ported from the RR dex (dex.radicalred.net) save reader, which was reverse
 * engineered from the ROM. The save is a series of 4KB flash sectors; each
 * sector ends with its sector id (u16 at +0xFF4) and a save counter (u32 at
 * +0xFFC). The most recent copy of sector 0 holds trainer info and the
 * randomizer option flags; sector 4 holds game mode flags. */

import type { Run } from "../types";
import { SAVE_FILE_FEATURE } from "./featureFlags";
import { CHARSET } from "./saveCharset";

export interface SaveInfo {
  trainerName: string;
  trainedId: number;
  hardmode: boolean;
  restricted: boolean;
  random: {
    abilities: boolean;
    learnset: boolean;
    normalSpecies: boolean;
    scaledSpecies: boolean;
  };
}

const NAME_OFFSET = 0x000;
const TRAINED_ID_OFFSET = 0x00a;
// RAM 0203B25A 0x10 = Hardmode
const HARDMODE_BITFLAG = 0xdb2;
// RAM 0203B26B 0x40 = Restricted
const RESTRICTED_BITFLAG = 0xdc3;
// RAM 0203B17B 0x04 = Scaled species
const SCALED_SPECIES_BITFLAG = 0xf2b;
// RAM 0203B17C 0x1 = Normal species, 0x2 = Learnset, 0x4 = Ability
const NORMAL_SPECIES_LEARNSET_ABILITY_BITFLAG = 0xf2c;

function findSector(file: DataView, id: number): number {
  let latestOffset = -1;
  let latestSaveIndex = -1;
  for (let x = 0; x < 0x1c000; x += 0x1000) {
    if (x + 0x1000 > file.byteLength) break;
    const sectorId = file.getUint16(x + 0xff4, true);
    const saveIndex = file.getUint32(x + 0xffc, true);
    if (sectorId === id && saveIndex > latestSaveIndex) {
      latestOffset = x;
      latestSaveIndex = saveIndex;
    }
  }
  return latestOffset;
}

/** Returns null if the buffer doesn't look like a valid save (e.g. a save
 * state was selected instead of the emulator's .sav battery file). */
export function readSaveFile(buffer: ArrayBuffer): SaveInfo | null {
  const file = new DataView(buffer);
  if (file.byteLength < 0x1c000) return null;
  for (let sectorId = 0; sectorId < 14; sectorId++) {
    if (findSector(file, sectorId) === -1) return null;
  }

  const trainerInfo = findSector(file, 0x0);
  const trainedId = file.getUint32(trainerInfo + TRAINED_ID_OFFSET, true);
  let trainerName = "";
  for (let idx = 0; idx < 8; idx++) {
    const char = file.getUint8(trainerInfo + NAME_OFFSET + idx);
    if (char === 0xff) break;
    trainerName += CHARSET[char];
  }

  const scaledBitflag = file.getUint8(trainerInfo + SCALED_SPECIES_BITFLAG);
  const randomBitFlag = file.getUint8(
    trainerInfo + NORMAL_SPECIES_LEARNSET_ABILITY_BITFLAG,
  );

  const gameSpecificData = findSector(file, 0x4);
  const hardmodeBitflag = file.getUint8(gameSpecificData + HARDMODE_BITFLAG);
  const restrictedBitFlag = file.getUint8(gameSpecificData + RESTRICTED_BITFLAG);

  return {
    trainerName,
    trainedId,
    hardmode: (hardmodeBitflag & 0x10) > 0,
    restricted: (restrictedBitFlag & 0x40) > 0,
    random: {
      abilities: (randomBitFlag & 0x4) > 0,
      learnset: (randomBitFlag & 0x2) > 0,
      normalSpecies: (randomBitFlag & 0x1) > 0,
      scaledSpecies: (scaledBitflag & 0x4) > 0,
    },
  };
}

export function hasSpeciesRandomizer(info: SaveInfo | undefined | null): boolean {
  return !!info && (info.random.normalSpecies || info.random.scaledSpecies);
}

/** manual toggle on the run, or (behind the save-file flag) detected from
 * the uploaded save */
export function speciesRandomized(run: Run | null): boolean {
  if (run?.randomizer?.species) return true;
  return SAVE_FILE_FEATURE && !!run && hasSpeciesRandomizer(run.saveInfo);
}

export function abilitiesRandomized(run: Run | null): boolean {
  if (run?.randomizer?.abilities) return true;
  return SAVE_FILE_FEATURE && !!run?.saveInfo?.random.abilities;
}
