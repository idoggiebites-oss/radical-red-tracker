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
}

// ------------------------------------------------------------- run state

export type GameMode = "default" | "hardcore";

export type EncounterStatus = "caught" | "fainted" | "missed" | "skipped";

export interface RouteEncounter {
  species: string;
  nickname: string;
  status: EncounterStatus;
  inParty: boolean;
  /** enemy Pokémon this one has knocked out during the run (usage tracker).
   * Missing on runs created before the field existed — treat as 0. */
  kos?: number;
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
  /** randomizer discoveries: original species -> randomized species.
   * RR's species randomizer is a global 1-to-1 mapping, so one discovery
   * applies to every encounter slot of that species. */
  speciesMap?: Record<string, string>;
}

export interface AppState {
  runs: Run[];
  activeRunId: string | null;
}
