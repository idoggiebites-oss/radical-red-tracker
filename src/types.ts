export interface EncounterSlot {
  species: string;
  rarity: string;
  levels: string;
}

export type MethodKey =
  | "grass_day"
  | "grass_night"
  | "old_rod"
  | "good_rod"
  | "super_rod"
  | "surfing";

export interface Location {
  id: string;
  name: string;
  postgame: boolean;
  methods: Partial<Record<MethodKey, EncounterSlot[]>>;
}

export interface StaticEncounter {
  species: string;
  info: string;
}

export interface Gift {
  location: string;
  species: string;
  requirements: string;
  info: string;
}

export interface Trade {
  location: string;
  give: string;
  receive: string;
}

export interface RaidDrop {
  item: string;
  rarity: string;
}

export interface RaidDen {
  species: string;
  drops: RaidDrop[];
}

export interface RaidLocation {
  location: string;
  stars: number;
  dens: RaidDen[];
}

export interface RaidsData {
  info: string[];
  locations: RaidLocation[];
}

export interface EncountersData {
  locations: Location[];
  statics: StaticEncounter[];
  gifts: Gift[];
  trades: Trade[];
  fossils: Record<string, string[]>;
  eggVendor: Record<string, string[]>;
  raids: RaidsData;
}

export interface BossMon {
  species: string;
  level: string;
  nature: string;
  ability: string;
  item: string;
  moves: string[];
  baseStats: Record<string, string>;
  evs: Record<string, string>;
  speedStat: string;
  altSpeeds: Record<string, string>;
}

/** a boss Pokémon's Calc button was clicked: jump to the dedicated
 * Calculator page and prefill the Opponent card with it */
export interface CalcTarget {
  mon: BossMon;
  battleEffect: string;
  levelCap?: number;
  /** the rest of this Pokémon's boss team, so the Calculator page can offer
   * a quick switcher between teammates without leaving the page */
  team: BossMon[];
  teamLabel: string;
}

export interface BossReward {
  label: string;
  text: string;
}

export interface Boss {
  title: string;
  subtitle: string;
  battleEffect: string;
  notes: string;
  rewards: BossReward[];
  pokemon: BossMon[];
  /** fought back-to-back with the previous boss in this list (docs' "(!)
   * BACK TO BACK" annotation — no healing between the fights) */
  chained?: boolean;
  /** the NEXT boss in this list is chained to this one — set on the first
   * fight of a back-to-back pair, mirroring `chained` on the second */
  chainedNext?: boolean;
}

export interface BossCategory {
  name: string;
  bosses: Boss[];
}

export interface TrainerOrderEntry {
  name: string;
  levelCap: string;
  optional: boolean;
  location: string;
  rewards: BossReward[];
  /** post-Sabrina fork to Fuchsia City: Route 12/13/14/15 (Snow/Sun) is
   * "east", Route 16/17/18 (Sandstorm/Rain) is "west" — only one side needs
   * clearing, gated on Run.sabrinaRoute rather than the doc's own optional
   * markers (which mark individual side fights, not whole branches) */
  routeChoice?: "east" | "west";
}

export interface BossMode {
  trainerOrder: TrainerOrderEntry[];
  categories: BossCategory[];
}

export interface BossesData {
  default: BossMode;
  hardcore: BossMode;
}

export interface TmEntry {
  num: string;
  move: string;
  location: string;
  notes: string[];
}

export interface ItemEntry {
  name: string;
  location: string;
}

export interface ItemArea {
  area: string;
  items: ItemEntry[];
}

export interface ItemsData {
  tms: TmEntry[];
  hms: TmEntry[];
  overworld: ItemArea[];
  megaStones: ItemEntry[];
  zCrystals: ItemEntry[];
  /** normalized item name -> RR dex item ID, for item sprites */
  spriteIds: Record<string, number>;
}

// ------------------------------------------------------------- run state

export type GameMode = "default" | "hardcore";

export type EncounterStatus = "caught" | "fainted" | "missed" | "skipped";

/** the set a caught Pokémon is actually running, editable on the Team tab
 * and imported by the damage calculator */
export interface MonBuild {
  nature: string;
  ability: string;
  item: string;
  moves: string[];
  /** stat -> EVs invested (HP/ATK/DEF/SPA/SPD/SPE); missing = 0. Optional
   * so builds saved before this field existed still load fine. */
  evs?: Record<string, number>;
}

/** a run's caught Pokémon, as the damage calc's species picker sees them */
export interface CaughtMon {
  species: string;
  nickname: string;
  build?: MonBuild;
}

export interface RouteEncounter {
  species: string;
  nickname: string;
  status: EncounterStatus;
  inParty: boolean;
  /** enemy Pokémon this one has knocked out during the run (usage tracker).
   * Missing on runs created before the field existed — treat as 0. */
  kos?: number;
  build?: MonBuild;
  /** post-mortem: quick cause-of-death tags and a free-form note on what
   * went wrong, edited from the graveyard */
  deathTags?: string[];
  deathNote?: string;
}

export interface RunSaveInfo {
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

export interface Run {
  id: string;
  name: string;
  mode: GameMode;
  createdAt: number;
  /** location id -> the one nuzlocke encounter taken there */
  encounters: Record<string, RouteEncounter>;
  /** trainer-order index -> defeated */
  defeated: Record<number, boolean>;
  /** parsed from an uploaded .sav, if any */
  saveInfo?: RunSaveInfo;
  /** legacy global randomizer mapping (original -> randomized species) from
   * older runs; still read for starter identification, no longer written */
  speciesMap?: Record<string, string>;
  /** species randomizer sightings, keyed `<locationId>|<docSpecies>` -> what
   * actually appeared in that slot. Display-only and per route — catches are
   * whatever the user types in the species box. */
  seenSpecies?: Record<string, string>;
  /** manual randomizer toggles (Routes toolbar; the hidden save-file import
   * can also detect them): species unlocks the route "became…" mapping UI,
   * abilities frees the ability inputs in builds and the calc */
  randomizer?: { species?: boolean; abilities?: boolean };
  /** lab ball taken: 0 left/grass · 1 middle/water · 2 right/fire. The
   * position decides the rival's counterpick even when the species are a
   * different region's trio or randomized. */
  starterPos?: 0 | 1 | 2;
  /** which region's trio the lab offers (display only, default Kanto) */
  starterRegion?: string;
  /** the game-start "Minimal Grind" option: EVs don't apply at all, same
   * as hardcore/restricted mode already implies — hides EV inputs in the
   * calc and build editor, independent of which game mode this run uses */
  minimalGrind?: boolean;
  /** the post-Sabrina route to Fuchsia City: unset until the player picks
   * (see TrainerOrderEntry.routeChoice) */
  sabrinaRoute?: "east" | "west";
}

export interface AppState {
  runs: Run[];
  activeRunId: string | null;
}
