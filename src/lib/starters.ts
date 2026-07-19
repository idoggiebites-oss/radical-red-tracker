import type { Run } from "../types";
import { STARTER_ID } from "./storage";

/** the three lab pokéballs map to the Kanto trio; the rival always takes
 * the one that counters yours, which decides his teams all game */
export const STARTER_TRIO = ["Bulbasaur", "Charmander", "Squirtle"] as const;

const RIVAL_COUNTER: Record<string, string> = {
  Bulbasaur: "Charmander",
  Charmander: "Squirtle",
  Squirtle: "Bulbasaur",
};

/** which trio slot the player took: direct pick, or reverse-lookup through
 * the randomizer mapping when the recorded starter is a mapped species */
export function playerStarterBase(run: Run | null): string | null {
  const species = run?.encounters[STARTER_ID]?.species;
  if (!species) return null;
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
