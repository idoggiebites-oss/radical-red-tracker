import type { MethodKey } from "../types";

/** shared by the Routes tables and the Pokédex's "where to catch it" lookup,
 * so the two can't drift into naming the same slot differently */
export const METHOD_LABELS: Record<MethodKey, string> = {
  grass_day: "Grass / Cave · Day",
  grass_night: "Grass / Cave · Night",
  old_rod: "Old Rod",
  good_rod: "Good Rod",
  super_rod: "Super Rod",
  surfing: "Surfing",
};
