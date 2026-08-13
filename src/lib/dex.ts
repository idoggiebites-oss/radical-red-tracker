/** the Reference tab's Pokédex: one entry per species, answered from data the
 * app already ships.
 *
 * The interesting part is abilities. A randomized run's abilities are not
 * stored anywhere — the game recomputes them from the trainer id — so with a
 * save imported we can replay that hash (see abilityRandomizer.ts) and show
 * what a species' abilities REALLY are in this run, for the whole dex and not
 * just for what's been caught. Nothing else the randomizer touches is
 * recoverable: species randomization looks like a seeded shuffle and was
 * shelved, and the learnset randomizer's mapping is unknown, so those two
 * stay dex-standard and `dexCaveats` says so out loud.
 */

import typesJson from "../data/types.json";
import encountersJson from "../data/encounters.json";
import type { EncountersData, MethodKey, Run } from "../types";
import { METHOD_LABELS } from "./methods";
import { STAT_KEYS, statsFor, type StatKey } from "./effectiveness";
import {
  abilityNames,
  abilitySlotsBySpecies,
  abilityRollFor,
  type AbilityRoll,
} from "./abilityRandomizer";

const types = typesJson as unknown as {
  species: Record<string, string[]>;
  spriteIds: Record<string, number>;
};
const encounters = encountersJson as unknown as EncountersData;

export interface DexEntry {
  species: string;
  /** dex FORM id — Arcanine-Hisui has its own, and it is what the ability
   * hash keys on; several entries can share a national number */
  dexId: number;
  types: string[];
  stats: Partial<Record<StatKey, number>>;
  bst: number;
}

/** every species the app knows, in dex order. Built once at module load —
 * 1247 entries of already-parsed JSON, nothing worth deferring. */
export const DEX_ENTRIES: DexEntry[] = Object.keys(types.species)
  .map((species) => {
    const stats = statsFor(species);
    return {
      species,
      dexId: types.spriteIds[species] ?? 0,
      types: types.species[species] ?? [],
      stats,
      bst: STAT_KEYS.reduce((n, k) => n + (stats[k] ?? 0), 0),
    };
  })
  .sort((a, b) => a.dexId - b.dexId || a.species.localeCompare(b.species));

export interface DexAbility {
  /** game slot: 0 and 1 are the normal abilities, 2 is hidden */
  slot: number;
  /** what the dex says */
  base: string;
  /** what this run actually gives it — equal to `base` outside a randomized run */
  actual: string;
}

/** a species' abilities in game slot order, rolled through the run's
 * randomizer when there is one. Empty slots are dropped, and a species whose
 * slots repeat an ability only lists it once — but on what is *shown*, since
 * a randomized run can roll one shared base into two different abilities. */
export function abilitiesFor(entry: DexEntry, roll: AbilityRoll | null): DexAbility[] {
  const slots = abilitySlotsBySpecies[String(entry.dexId)] ?? [];
  const out: DexAbility[] = [];
  slots.forEach((baseId, slot) => {
    if (!baseId) return;
    const base = abilityNames[String(baseId)] ?? "";
    if (!base) return;
    const actual = roll
      ? abilityNames[String(roll(entry.dexId, baseId))] ?? base
      : base;
    if (out.some((a) => a.base === base && a.actual === actual)) return;
    out.push({ slot, base, actual });
  });
  return out;
}

export { abilityRollFor };

export interface CatchSpot {
  where: string;
  method: string;
  detail: string;
}

let catchIndex: Map<string, CatchSpot[]> | null = null;

/** every place a species can be got: wild slots, statics, gifts, trades,
 * fossils, the egg vendor and raid dens. The docs are organised by location,
 * so this reverse index doesn't exist anywhere else in the data. */
export function catchSpotsFor(species: string): CatchSpot[] {
  if (!catchIndex) {
    const index = new Map<string, CatchSpot[]>();
    const add = (name: string, spot: CatchSpot) => {
      if (!name) return;
      const list = index.get(name);
      if (list) list.push(spot);
      else index.set(name, [spot]);
    };
    for (const loc of encounters.locations) {
      for (const [method, slots] of Object.entries(loc.methods)) {
        for (const slot of slots ?? []) {
          add(slot.species, {
            where: loc.name + (loc.postgame ? " (post-game)" : ""),
            method: METHOD_LABELS[method as MethodKey] ?? method,
            detail: [slot.rarity, slot.levels && `Lv ${slot.levels}`]
              .filter(Boolean)
              .join(" · "),
          });
        }
      }
    }
    for (const s of encounters.statics) {
      add(s.species, { where: s.info, method: "Static", detail: "" });
    }
    for (const g of encounters.gifts) {
      add(g.species, {
        where: g.location,
        method: "Gift",
        detail: [g.info, g.requirements].filter(Boolean).join(" · "),
      });
    }
    // `receive` is the species you end up with; `give` is the cost
    for (const t of encounters.trades) {
      add(t.receive, {
        where: t.location,
        method: "Trade",
        detail: t.give ? `for ${t.give}` : "",
      });
    }
    for (const [shard, list] of Object.entries(encounters.fossils)) {
      for (const name of list) add(name, { where: shard, method: "Fossil", detail: "" });
    }
    for (const [shard, list] of Object.entries(encounters.eggVendor)) {
      for (const name of list) add(name, { where: shard, method: "Egg vendor", detail: "" });
    }
    for (const loc of encounters.raids.locations) {
      for (const den of loc.dens) {
        add(den.species, {
          where: loc.location,
          method: "Raid den",
          detail: `${loc.stars}★`,
        });
      }
    }
    catchIndex = index;
  }
  return catchIndex.get(species) ?? [];
}

export interface BossAppearance {
  mode: "default" | "hardcore";
  category: string;
  title: string;
  level: string;
}

/** bosses.json is a 602 kB chunk, so the fights a species turns up in load
 * only once the Pokédex is opened — same discipline as the learnset table */
let bossIndex: Map<string, BossAppearance[]> | null = null;
let bossPending: Promise<void> | null = null;

export const bossIndexReady = () => bossIndex !== null;

export function loadBossIndex(): Promise<void> {
  if (bossIndex) return Promise.resolve();
  // no retry: a failed module import is recorded in the browser's module map,
  // so re-importing the same URL never refetches (see learnsets.ts)
  bossPending ??= import("../data/bosses.json").then((m) => {
    const data = m.default as unknown as Record<
      string,
      {
        categories: {
          name: string;
          bosses: { title: string; pokemon: { species: string; level: string }[] }[];
        }[];
      }
    >;
    const index = new Map<string, BossAppearance[]>();
    for (const mode of ["default", "hardcore"] as const) {
      for (const cat of data[mode]?.categories ?? []) {
        for (const boss of cat.bosses ?? []) {
          for (const mon of boss.pokemon ?? []) {
            const list = index.get(mon.species) ?? [];
            // variant teams can field the same species twice in one fight;
            // one row per fight is what's useful
            if (!list.some((b) => b.mode === mode && b.title === boss.title)) {
              list.push({ mode, category: cat.name, title: boss.title, level: mon.level });
            }
            index.set(mon.species, list);
          }
        }
      }
    }
    bossIndex = index;
  });
  return bossPending;
}

export function bossesFor(species: string): BossAppearance[] {
  return bossIndex?.get(species) ?? [];
}

/** what the Pokédex cannot answer for this run, so it can say so rather than
 * quietly presenting dex defaults as facts */
export function dexCaveats(run: Run | null | undefined): string[] {
  const out: string[] = [];
  const info = run?.saveInfo;
  if (info?.random.normalSpecies || info?.random.scaledSpecies) {
    out.push("species are randomized — which Pokémon actually appears on a route isn't recoverable");
  }
  if (info?.random.learnset) {
    out.push("learnsets are randomized — the move lists here are the dex's");
  }
  return out;
}
