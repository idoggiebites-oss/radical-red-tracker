import type { Location } from "../types";

/** one nuzlocke area: floor/section locations folded into a single route
 * row with one encounter slot shared by all sections */
export interface RouteSection {
  /** section heading ("1F", "FOREST EXPANSION"); null for the main area */
  label: string | null;
  loc: Location;
}

export interface RouteGroup {
  /** first member's location id — the canonical encounter-slot id */
  id: string;
  name: string;
  postgame: boolean;
  sections: RouteSection[];
}

/** trailing floor designators: "1F", "B1F", "B3F-B4F", "3&5F" */
const SECTION_SUFFIX = / ((?:B?\d+[&-])?B?\d+F(?:-B?\d+F)?)$/;

/** areas whose names don't follow the floor pattern but count as one
 * nuzlocke area */
const EXPLICIT: Record<string, { base: string; label: string }> = {
  "FOREST EXPANSION": { base: "VIRIDIAN FOREST", label: "FOREST EXPANSION" },
  "MT. EMBER EXTERIOR": { base: "MT. EMBER", label: "EXTERIOR" },
  "SAFARI CENTER (ZONE 1)": { base: "SAFARI ZONE", label: "CENTER (ZONE 1)" },
  "SAFARI EAST (ZONE 2)": { base: "SAFARI ZONE", label: "EAST (ZONE 2)" },
  "SAFARI NORTH (ZONE 3)": { base: "SAFARI ZONE", label: "NORTH (ZONE 3)" },
  "SAFARI WEST (ZONE 4)": { base: "SAFARI ZONE", label: "WEST (ZONE 4)" },
  "SAFARI FAR-WEST (ZONE 5)": { base: "SAFARI ZONE", label: "FAR-WEST (ZONE 5)" },
  "ROUTE 21A": { base: "ROUTE 21", label: "21A" },
  "ROUTE 21B": { base: "ROUTE 21", label: "21B" },
};

function splitName(name: string): { base: string; label: string | null } {
  const ex = EXPLICIT[name];
  if (ex) return ex;
  const m = name.match(SECTION_SUFFIX);
  if (m) return { base: name.slice(0, m.index), label: m[1] };
  return { base: name, label: null };
}

/** fold the doc locations into nuzlocke areas, preserving doc order (a
 * group sits where its first member appeared) */
export function groupLocations(locations: Location[]): RouteGroup[] {
  const groups: RouteGroup[] = [];
  const byBase = new Map<string, RouteGroup>();
  for (const loc of locations) {
    const { base, label } = splitName(loc.name);
    let g = byBase.get(base);
    if (!g) {
      g = { id: loc.id, name: base, postgame: loc.postgame, sections: [] };
      byBase.set(base, g);
      groups.push(g);
    }
    // a group is post-game only if every section is
    g.postgame = g.postgame && loc.postgame;
    g.sections.push({ label, loc });
  }
  return groups;
}
