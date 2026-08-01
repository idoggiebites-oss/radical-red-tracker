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
import { groupLocations, type RouteGroup } from "./routeGroups";
import type { Location, Run } from "../types";
import { STARTER_ID } from "./storage";
import { EGG_LOCATIONS } from "./eggLocations";

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
const BOX_ITEM = 0x1e;
const BOX_MET_LOCATION = 0x33;

/** Boxed moves are packed, not stored as four u16s. The eight bytes at +0x24
 * are a little-endian 64-bit field whose top 40 bits hold four 10-bit move
 * ids (10 bits reaches 1023; RR has 1003 moves, so the fit is deliberate).
 * The low 24 bits are something else — PP Ups and friendship most likely;
 * current PP needn't be stored because gen 3 heals a Pokémon on withdrawal.
 *
 * Found by diffing one Pokémon across two saves, boxed in the first and
 * withdrawn into the party in the second, so its real moves were known.
 * Verified on two such Pokémon plus eight more that decode to coherent
 * level-appropriate movesets. */
const BOX_MOVES = 0x24;
const BOX_MOVE_BITS = 10;
const BOX_MOVE_SHIFT = 24;
const BOX_SLOTS = 14 * 30;

/** A SECOND Pokémon storage region, in sector 0 after the trainer block, in
 * the same 58-byte format. It is where the boxes past what the PC region can
 * hold actually live: sections 5-13 give 615 slots, only 20.5 boxes of 30, so
 * a box numbered above that cannot physically be there. Players commonly
 * reserve a high box as a nuzlocke graveyard, which is how this was found —
 * 15 Pokémon that a box-count-capped reader misses entirely.
 *
 * Entries here are filtered on the trainer's own OT id: unlike the PC region
 * this sector holds unrelated data, and without that filter it produces
 * convincing false positives. */
const EXTRA_SECTION = 0;
const EXTRA_START = 0xb0;
const TRAINER_ID_OFFSET = 0x0a;

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
  // 132-142, the Kanto dungeons. Self-confirming from a late-game save:
  // byte 139 held an Articuno and 142 a Zapdos, which is exactly where the
  // Seafoam Islands and the Power Plant sit in this order.
  "Victory Road", "Rocket Hideout", "Silph Co.", "Pokemon Mansion",
  "Safari Zone", "Pokemon League", "Rock Tunnel", "Seafoam Islands",
  "Pokemon Tower", "Cerulean Cave", "Power Plant",
  // Sevii, anchored at three points from real catches: One Island (143),
  // Kindle Road (150) and Treasure Beach (151). Exactly seven slots separate
  // the first two, which is exactly the seven islands — the same structural
  // check that confirmed the Underground Path pair back in Kanto.
  //
  // Seven Island really does come before Six in FireRed's table. Neither is
  // in the docs' encounter data, so the order can't affect placement either
  // way, but don't "correct" it.
  "One Island", "Two Island", "Three Island", "Four Island", "Five Island",
  "Seven Island", "Six Island",
  "Kindle Road", "Treasure Beach",
  // 152+ continues into Cape Brink, Bond Bridge, Mt. Ember and Berry Forest,
  // several of which the docs DO have encounter tables for — so a wrong guess
  // here would misplace rather than merely fail. Unanchored, so unmapped.
];

/** RR reports the starter as 157, which in vanilla FireRed is an unused
 * Sevii placeholder. Confirmed on two unrelated saves whose owners named
 * their starter. It goes to the app's starter slot, not a route. */
const MAPSEC_STARTER = 157;
/** gen 3's "hatched from an egg" met location — the four unnamed starters in
 * a test save all reported it. An egg was never caught anywhere, so it has no
 * route to claim. */
const METLOC_EGG = 253;

export function mapsecName(byte: number): string | null {
  return MAPSEC_NAMES[byte - MAPSEC_BASE] || null;
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
  /** from the overflow storage region rather than the PC boxes. Players tend
   * to use a high box as a graveyard, but the save records no such thing, so
   * whether that means "fainted" is the player's call, not ours. */
  extraStorage: boolean;
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
      extraStorage: false,
    });
  }
  return out;
}

/** decode one 58-byte compact entry (PC box or overflow storage) */
function readCompactMon(
  view: DataView,
  bytes: Uint8Array,
  o: number,
): Omit<SaveMon, "inParty" | "boxSlot" | "extraStorage"> | null {
  const pid = view.getUint32(o, true);
  const speciesId = view.getUint16(o + BOX_SPECIES, true);
  const species = speciesById.get(speciesId);
  if (!pid || !speciesId || !species) return null;
  const packed = view.getBigUint64(o + BOX_MOVES, true);
  const mask = (1n << BigInt(BOX_MOVE_BITS)) - 1n;
  const moveIds = [0, 1, 2, 3].map((n) =>
    Number((packed >> BigInt(BOX_MOVE_SHIFT + n * BOX_MOVE_BITS)) & mask),
  );
  const metLocation = bytes[o + BOX_MET_LOCATION];
  return {
    speciesId,
    species,
    nickname: decodeText(bytes.subarray(o + 8, o + 18)),
    level: null,
    nature: GAME_NATURES[pid % 25] ?? "",
    item: itemById.get(view.getUint16(o + BOX_ITEM, true)) ?? "",
    moves: moveIds.filter(Boolean).map((id) => moveById[String(id)] ?? ""),
    evs: {},
    ivs: {},
    metLocation,
    metLocationName: mapsecName(metLocation),
    metLevel: null,
  };
}

/** the overflow storage region — see EXTRA_START. Filtered on the trainer's
 * own OT id, because this sector holds plenty that isn't a Pokémon. */
export function readExtraStorage(buffer: ArrayBuffer): SaveMon[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < SAVE_BYTES) return [];
  const sectors = sectorMap(view);
  const base = sectors.get(EXTRA_SECTION);
  if (base === undefined) return [];
  const trainerId = view.getUint32(base + TRAINER_ID_OFFSET, true);
  const out: SaveMon[] = [];
  for (let slot = 0; base + EXTRA_START + (slot + 1) * BOX_STRIDE <= base + SECTOR_DATA; slot++) {
    const o = base + EXTRA_START + slot * BOX_STRIDE;
    if (view.getUint32(o + 4, true) !== trainerId) continue;
    const mon = readCompactMon(view, bytes, o);
    if (mon) out.push({ ...mon, inParty: false, boxSlot: slot, extraStorage: true });
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
    // BigInt: the move field's top bits sit above 32, where >>> would wrap
    const packed = pcView.getBigUint64(o + BOX_MOVES, true);
    const mask = (1n << BigInt(BOX_MOVE_BITS)) - 1n;
    const moveIds = [0, 1, 2, 3].map((n) =>
      Number((packed >> BigInt(BOX_MOVE_SHIFT + n * BOX_MOVE_BITS)) & mask),
    );
    out.push({
      speciesId,
      species,
      nickname: decodeText(pc.subarray(o + 8, o + 18)),
      level: null,
      nature: GAME_NATURES[pid % 25] ?? "",
      item: itemById.get(pcView.getUint16(o + BOX_ITEM, true)) ?? "",
      moves: moveIds.filter(Boolean).map((id) => moveById[String(id)] ?? ""),
      evs: {},
      ivs: {},
      metLocation,
      metLocationName: mapsecName(metLocation),
      metLevel: null,
      inParty: false,
      boxSlot: slot,
      extraStorage: false,
    });
  }
  return out;
}


/** MAPSEC names the docs spell differently. Everything else matches once
 * case and punctuation are folded. */
const MAPSEC_ALIASES: Record<string, string> = {
  "Vermilion City": "VERMILLION CITY", // the docs use two Ls
  "Diglett's Cave": "DIGLETT CAVE", // and drop the possessive
  "Pokemon Mansion": "MANSION", // the docs drop "Pokemon"
  "Seafoam Islands": "SEAFOAM", // and "Islands"
  "Pokemon Tower": "PKMN TOWER", // and abbreviate this one
  // Safari Zone needs none: routeGroups already folds its five zones onto
  // that base name, the same way it folds Route 21A/21B onto Route 21.
};

const foldName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export interface PlacedMon {
  mon: SaveMon;
  /** the route group's encounter-slot id, or null when we can't place it */
  locationId: string | null;
  /** why it couldn't be placed, for the UI to explain rather than hide */
  unplacedReason: string | null;
}

/** Match each Pokémon's met location to the route group that owns its
 * encounter slot. Deliberately conservative: anything that doesn't resolve
 * cleanly is returned unplaced with a reason, for the player to assign, not
 * guessed at. Several real map sections (Lavender Town, Saffron City, Indigo
 * Plateau, the Underground Paths) have no wild encounters, so the docs never
 * list them and there is no slot to place a gift or trade caught there. */
export function placeOnRoutes(mons: SaveMon[], locations: Location[]): PlacedMon[] {
  const groups: RouteGroup[] = groupLocations(locations);
  const byName = new Map<string, string>();
  for (const g of groups) if (!byName.has(foldName(g.name))) byName.set(foldName(g.name), g.id);
  // Egg locations are real encounter slots the Routes list synthesises, but
  // they aren't in encounters.json because the docs' sheets only cover wild
  // encounters. Without them a Pokemon hatched in Saffron City or Lavender
  // Town reads as "nowhere we recognise". Keyed on the bare place name, which
  // is what a met location reports; real routes are added first and win.
  for (const e of EGG_LOCATIONS) {
    if (!byName.has(foldName(e.name))) byName.set(foldName(e.name), e.id);
  }

  const taken = new Map<string, string>(); // locationId -> the nickname that claimed it
  return mons.map((mon) => {
    if (mon.metLocation === MAPSEC_STARTER) {
      const claimed = taken.get(STARTER_ID);
      if (claimed) {
        return { mon, locationId: null, unplacedReason: `the starter slot is already taken by ${claimed}` };
      }
      taken.set(STARTER_ID, mon.nickname || mon.species);
      return { mon, locationId: STARTER_ID, unplacedReason: null };
    }
    if (mon.metLocation === METLOC_EGG) {
      return { mon, locationId: null, unplacedReason: "hatched from an egg, not caught on a route" };
    }
    const name = mon.metLocationName;
    if (!name) {
      return { mon, locationId: null, unplacedReason: `unknown map section (${mon.metLocation})` };
    }
    const id = byName.get(foldName(MAPSEC_ALIASES[name] ?? name));
    if (!id) return { mon, locationId: null, unplacedReason: `${name} is not a route we track` };
    const claimed = taken.get(id);
    if (claimed) {
      return { mon, locationId: null, unplacedReason: `${name} is already taken by ${claimed}` };
    }
    taken.set(id, mon.nickname || mon.species);
    return { mon, locationId: id, unplacedReason: null };
  });
}

/** the run.encounters map a set of placed Pokémon would produce.
 *
 * `graveyard` marks everything from the overflow storage region as fainted.
 * That's opt-in because the save never records a death — reserving a high box
 * for the fallen is a player convention, and someone using it as ordinary
 * storage would have a boxful wrongly buried. */
export function encountersFrom(
  placed: PlacedMon[],
  opts: { graveyard?: boolean } = {},
): Run["encounters"] {
  const out: Run["encounters"] = {};
  for (const p of placed) {
    if (!p.locationId) continue;
    const m = p.mon;
    const buried = opts.graveyard && m.extraStorage;
    out[p.locationId] = {
      species: m.species,
      nickname: m.nickname,
      status: buried ? "fainted" : "caught",
      inParty: buried ? false : m.inParty,
      kos: 0,
      build: {
        nature: m.nature || "Serious",
        ability: "",
        item: m.item,
        moves: [0, 1, 2, 3].map((i) => m.moves[i] ?? ""),
        evs: m.evs,
      },
    };
  }
  return out;
}
