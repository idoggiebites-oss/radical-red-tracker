import type { Run } from "../types";
import { STARTER_ID } from "./storage";
import { preEvolutionsFor } from "./effectiveness";

/** the three lab pokéballs map to the Kanto trio; the rival always takes
 * the one that counters yours, which decides his teams all game */
export const STARTER_TRIO = ["Bulbasaur", "Charmander", "Squirtle"] as const;

const RIVAL_COUNTER: Record<string, string> = {
  Bulbasaur: "Charmander",
  Charmander: "Squirtle",
  Squirtle: "Bulbasaur",
};

/** the species plus everything it could have evolved from, so an evolved
 * starter (Ivysaur, Charizard, ...) still identifies the original pick */
function withPreEvolutions(species: string): string[] {
  const seen = new Set([species]);
  const queue = [species];
  while (queue.length > 0) {
    for (const pre of preEvolutionsFor(queue.pop()!)) {
      if (!seen.has(pre)) {
        seen.add(pre);
        queue.push(pre);
      }
    }
  }
  return [...seen];
}

/** which trio slot the player took: direct pick, or reverse-lookup through
 * the randomizer mapping when the recorded starter is a mapped species */
export function playerStarterBase(run: Run | null): string | null {
  const recorded = run?.encounters[STARTER_ID]?.species;
  if (!recorded) return null;
  for (const species of withPreEvolutions(recorded)) {
    for (const base of STARTER_TRIO) {
      if (base.toLowerCase() === species.toLowerCase()) return base;
    }
    for (const [orig, mapped] of Object.entries(run?.speciesMap ?? {})) {
      if (
        mapped.toLowerCase() === species.toLowerCase() &&
        (STARTER_TRIO as readonly string[]).includes(orig)
      ) {
        return orig;
      }
    }
  }
  return null;
}

/** the starter the rival is running, given the player's pick */
export function rivalStarterFor(run: Run | null): string | null {
  const base = playerStarterBase(run);
  return base ? RIVAL_COUNTER[base] : null;
}

const RIVAL_SUBTITLE = /IF RIVAL HAS (BULBASAUR|CHARMANDER|SQUIRTLE)/i;

/** false when a boss block is a rival-starter variant that can't occur for
 * this run's starter pick; true otherwise (incl. when the starter is unknown) */
export function bossMatchesStarter(subtitle: string, rivalStarter: string | null): boolean {
  if (!rivalStarter) return true;
  const m = subtitle.match(RIVAL_SUBTITLE);
  if (!m) return true;
  return m[1].toLowerCase() === rivalStarter.toLowerCase();
}
