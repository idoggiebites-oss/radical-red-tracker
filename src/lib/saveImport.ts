/** Reading Pokémon out of a Radical Red 4.1 .sav.
 *
 * RR is a FireRed hack, so the container is a standard 128KB GBA save: two
 * slots of 14 sectors, each sector tagged with its id at +0xFF4, the magic
 * 0x08012025 at +0xFF8 and a save counter at +0xFFC; the highest counter
 * wins. saveFile.ts already does that part for the trainer/flag data.
 *
 * What is NOT standard, and is why this was worth reverse-engineering:
 *   - RR does not encrypt or shuffle the Pokémon substructures. Vanilla gen 3
 *     XORs each mon with OTID^PID and permutes its four 12-byte substructures
 *     by PID % 24; RR stores them plainly, so party entries read directly.
 *   - Boxed Pokémon use a COMPACT 58-byte entry, not vanilla's 80. Species
 *     sits at +0x1C, where vanilla keeps a checksum, and met location at
 *     +0x33. Assuming the vanilla layout yields a plausible-looking mon with
 *     the wrong species, which is exactly the kind of silent wrongness worth
 *     failing loudly on instead.
 *
 * Every offset below was confirmed against a real 4.1 save whose owner told
 * us where six Pokémon were actually caught.
 */
import typesJson from "../data/types.json";
import itemsJson from "../data/items.json";
import moveIdsJson from "../data/moveIds.json";
import { canonicalItem } from "./damagecalc";

const SECTOR = 0x1000;
const SECTOR_ID = 0xff4;
const SECTOR_SIG = 0xff8;
const SECTOR_COUNTER = 0xffc;
const SIGNATURE = 0x08012025;
const SAVE_BYTES = 0x1c000;

// party lives in section 1: count at +0x34, then six 100-byte entries
const PARTY_SECTION = 1;
const PARTY_COUNT = 0x34;
const PARTY_START = 0x38;
const PARTY_STRIDE = 100;

// PC storage is sections 5-13 concatenated, 0xF80 usable bytes each, after a
// 4-byte header; entries are RR's compact 58-byte form
const BOX_SECTIONS = [5, 6, 7, 8, 9, 10, 11, 12, 13];
const SECTOR_DATA = 0xf80;
const BOX_HEADER = 4;
const BOX_STRIDE = 58;
const BOX_SPECIES = 0x1c;
const BOX_MET_LOCATION = 0x33;
const BOX_SLOTS = 14 * 30;

/** FireRed's MAPSEC table — RR uses it unmodified (verified: Pewter City=90,
 * Route 25=125, Diglett's Cave=131, Viridian Forest=126, Mt. Moon=127).
 * The two entries between Saffron City and Route 1 are FireRed's own "fly-up"
 * duplicates for the routes that have a Pokémon Center, which is why the
 * routes sit two higher than a naive city+route count would predict. */
const MAPSEC_BASE = 0x58;
const MAPSEC_NAMES: string[] = [
  "Pallet Town", "Viridian City", "Pewter City", "Cerulean City", "Lavender Town",
  "Vermilion City", "Celadon City", "Fuchsia City", "Cinnabar Island",
  "Indigo Plateau", "Saffron City", "Route 4", "Route 10",
  ...Array.from({ length: 25 }, (_, i) => `Route ${i + 1}`),
  "Viridian Forest", "Mt. Moon", "S.S. Anne", "Underground Path",
  "Underground Path", "Diglett's Cave",
];

export function mapsecName(byte: number): string | null {
  return MAPSEC_NAMES[byte - MAPSEC_BASE] ?? null;
}

// gen 3 text encoding: digits, then A-Z, then a-z, 0xFF terminates
function decodeText(bytes: Uint8Array): string {
  let out = "";
  for (const c of bytes) {
    if (c === 0xff) break;
    if (c >= 0xbb && c <= 0xd4) out += String.fromCharCode(65 + c - 0xbb);
    else if (c >= 0xd5 && c <= 0xee) out += String.fromCharCode(97 + c - 0xd5);
    else if (c >= 0xa1 && c <= 0xaa) out += String.fromCharCode(48 + c - 0xa1);
    else if (c === 0x00) out += " ";
    else out += "·";
  }
  return out.trim();
}

/** dex id -> the species name the rest of the app uses. Built by inverting
 * types.json's spriteIds rather than shipping a second species table, so it
 * can't drift from the names every other view resolves against.
 *
 * Nine ids carry several of our names, because the docs distinguish cosmetic
 * forms the dex does not (Burmy cloaks, Deerling seasons, Pumpkaboo sizes).
 * Pick the plainest: fewest form suffixes, then shortest, then alphabetical
 * for determinism. Sorting by dashes alone isn't enough — "Any Cap Pikachu"
 * and "Pikachu" both share id 25 and neither has one, so a caught Pikachu
 * imported under the randomizer-only label.
 *
 * Note this map is deliberately finer-grained than the dex's own names: the
 * dex labels ids 1184 and 1207 both "Urshifu", while ours separates them into
 * Urshifu and Urshifu-Rapid-Strike, which is the distinction that decides
 * whether the mon is Fighting/Dark or Fighting/Water. */
const speciesById: Map<number, string> = (() => {
  const ids = (typesJson as { spriteIds?: Record<string, number> }).spriteIds ?? {};
  const byId = new Map<number, string[]>();
  for (const [name, id] of Object.entries(ids)) {
    const list = byId.get(id);
    if (list) list.push(name);
    else byId.set(id, [name]);
  }
  const plainest = (a: string, b: string) =>
    a.split("-").length - b.split("-").length || a.length - b.length || a.localeCompare(b);
  return new Map([...byId].map(([id, names]) => [id, [...names].sort(plainest)[0]]));
})();

const itemById: Map<number, string> = (() => {
  const ids = (itemsJson as { spriteIds?: Record<string, number> }).spriteIds ?? {};
  const m = new Map<number, string>();
  for (const [normalized, id] of Object.entries(ids)) {
    if (!m.has(id)) m.set(id, canonicalItem(normalized) ?? normalized);
  }
  return m;
})();

const moveById = moveIdsJson as Record<string, string>;

/** the app's species name for a save's numeric id, or "" if we don't know it */
export function speciesNameFor(id: number): string {
  return speciesById.get(id) ?? "";
}

export interface SaveMon {
  speciesId: number;
  /** app-facing species name; "" when the id isn't in our data */
  species: string;
  nickname: string;
  /** party only — the compact box entry doesn't carry it */
  level: number | null;
  nature: string;
  item: string;
  moves: string[];
  evs: Record<string, number>;
  ivs: Record<string, number>;
  metLocation: number;
  /** null when the byte falls outside the confirmed block (e.g. the starter,
   * which reports 157 because Oak's Lab isn't a map section) */
  metLocationName: string | null;
  metLevel: number | null;
  inParty: boolean;
  boxSlot: number | null;
}

/** the GAME's nature order, which is what `PID % 25` indexes. Deliberately
 * not damagecalc's NATURES: that list is sorted alphabetically for the picker
 * dropdown, and using it here silently mislabels most Pokémon (a Quiet mon
 * reads as Naughty) while looking entirely reasonable. */
const GAME_NATURES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty",
  "Bold", "Docile", "Relaxed", "Impish", "Lax",
  "Timid", "Hasty", "Serious", "Jolly", "Naive",
  "Modest", "Mild", "Quiet", "Bashful", "Rash",
  "Calm", "Gentle", "Sassy", "Careful", "Quirky",
];

const EV_ORDER = ["HP", "ATK", "DEF", "SPE", "SPA", "SPD"];
const IV_ORDER = ["HP", "ATK", "DEF", "SPE", "SPA", "SPD"];

/** most recent copy of each sector id */
function sectorMap(view: DataView): Map<number, number> {
  const out = new Map<number, number>();
  const counters = new Map<number, number>();
  for (let off = 0; off + SECTOR <= Math.min(view.byteLength, SAVE_BYTES); off += SECTOR) {
    if (view.getUint32(off + SECTOR_SIG, true) !== SIGNATURE) continue;
    const id = view.getUint16(off + SECTOR_ID, true);
    const ctr = view.getUint32(off + SECTOR_COUNTER, true);
    if (!counters.has(id) || ctr > (counters.get(id) as number)) {
      counters.set(id, ctr);
      out.set(id, off);
    }
  }
  return out;
}

export function readParty(buffer: ArrayBuffer): SaveMon[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < SAVE_BYTES) return [];
  const sectors = sectorMap(view);
  const base = sectors.get(PARTY_SECTION);
  if (base === undefined) return [];

  const count = Math.min(bytes[base + PARTY_COUNT], 6);
  const out: SaveMon[] = [];
  for (let i = 0; i < count; i++) {
    const o = base + PARTY_START + i * PARTY_STRIDE;
    const pid = view.getUint32(o, true);
    const speciesId = view.getUint16(o + 0x20, true);
    if (!pid || !speciesId) continue;
    const ivWord = view.getUint32(o + 0x48, true);
    const origins = view.getUint16(o + 0x46, true);
    const evs: Record<string, number> = {};
    EV_ORDER.forEach((k, n) => (evs[k] = bytes[o + 0x38 + n]));
    const ivs: Record<string, number> = {};
    IV_ORDER.forEach((k, n) => (ivs[k] = (ivWord >>> (5 * n)) & 31));
    const metLocation = bytes[o + 0x45];
    out.push({
      speciesId,
      species: speciesById.get(speciesId) ?? "",
      nickname: decodeText(bytes.subarray(o + 8, o + 18)),
      level: bytes[o + 0x54],
      nature: GAME_NATURES[pid % 25] ?? "",
      item: itemById.get(view.getUint16(o + 0x22, true)) ?? "",
      moves: [0, 1, 2, 3]
        .map((n) => view.getUint16(o + 0x2c + n * 2, true))
        .filter(Boolean)
        .map((id) => moveById[String(id)] ?? ""),
      evs,
      ivs,
      metLocation,
      metLocationName: mapsecName(metLocation),
      metLevel: origins & 0x7f,
      inParty: true,
      boxSlot: null,
    });
  }
  return out;
}

export function readBoxes(buffer: ArrayBuffer): SaveMon[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < SAVE_BYTES) return [];
  const sectors = sectorMap(view);

  // stitch the PC sectors back into one contiguous region
  const pc = new Uint8Array(BOX_SECTIONS.length * SECTOR_DATA);
  BOX_SECTIONS.forEach((id, i) => {
    const off = sectors.get(id);
    if (off === undefined) return;
    pc.set(new Uint8Array(buffer, off, SECTOR_DATA), i * SECTOR_DATA);
  });
  const pcView = new DataView(pc.buffer, pc.byteOffset, pc.byteLength);

  const out: SaveMon[] = [];
  for (let slot = 0; slot < BOX_SLOTS; slot++) {
    const o = BOX_HEADER + slot * BOX_STRIDE;
    if (o + BOX_STRIDE > pc.length) break;
    const pid = pcView.getUint32(o, true);
    const speciesId = pcView.getUint16(o + BOX_SPECIES, true);
    const species = speciesById.get(speciesId);
    // an empty slot is zeroes; junk further in the region can still parse as a
    // "valid" species, so require a real pid AND a species we actually know
    if (!pid || !speciesId || !species) continue;
    const metLocation = pc[o + BOX_MET_LOCATION];
    out.push({
      speciesId,
      species,
      nickname: decodeText(pc.subarray(o + 8, o + 18)),
      level: null,
      nature: GAME_NATURES[pid % 25] ?? "",
      item: "",
      moves: [],
      evs: {},
      ivs: {},
      metLocation,
      metLocationName: mapsecName(metLocation),
      metLevel: null,
      inParty: false,
      boxSlot: slot,
    });
  }
  return out;
}
