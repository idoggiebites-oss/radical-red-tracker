import type { EncountersData, StaticEncounter } from "../types";

/** a static encounter attached to a route row */
export interface LocatedStatic {
  /** run.encounters key for the "extra catch" slot (doesn't use the route slot) */
  id: string;
  static: StaticEncounter;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function staticSlotId(species: string): string {
  return (
    "static-" +
    species
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

/** location id -> statics, best-effort matched by the location name
 * appearing in the static's info text ("Lv. 70 - Power Plant."). A static
 * naming several locations (Snorlax on Routes 12 & 16) appears on each. */
export function staticsByLocation(
  data: EncountersData,
): Record<string, LocatedStatic[]> {
  const out: Record<string, LocatedStatic[]> = {};
  const locs = data.locations.map((l) => ({
    id: l.id,
    re: new RegExp(`\\b${escapeRe(l.name.toLowerCase())}\\b`),
  }));
  for (const s of data.statics) {
    const info = s.info.toLowerCase();
    for (const { id, re } of locs) {
      if (re.test(info)) {
        (out[id] ??= []).push({ id: staticSlotId(s.species), static: s });
      }
    }
  }
  return out;
}
