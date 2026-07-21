import type { Run, TrainerOrderEntry } from "../types";

/** display info for the post-Sabrina fork to Fuchsia City */
export const ROUTE_CHOICES: {
  value: "east" | "west";
  label: string;
  routes: string;
  weather: string;
}[] = [
  { value: "west", label: "West route", routes: "Route 16 → 18", weather: "Sandstorm, then Rain" },
  { value: "east", label: "East route", routes: "Route 12 → 15", weather: "Snow, then Sun" },
];

/** whether this trainer-order entry can be skipped when deciding what's
 * next: doc-optional side fights always can; a Sabrina-fork entry can once
 * the OTHER route was chosen, or always could if this were a normal
 * optional fight on your own chosen route; unset choice blocks on it. */
export function isEffectivelyOptional(
  entry: TrainerOrderEntry,
  run: Run | null,
): boolean {
  if (!entry.routeChoice) return !!entry.optional;
  const chosen = run?.sabrinaRoute;
  if (!chosen) return false;
  if (chosen === entry.routeChoice) return !!entry.optional;
  return true;
}

/** index of the next trainer-order entry that actually blocks progress —
 * skips anything already defeated or effectively optional. -1 if none left.
 * If it lands on an undecided fork entry, the caller should prompt for a
 * route (`entry.routeChoice && !run.sabrinaRoute`) rather than treat it as
 * a normal "next fight". */
export function nextRequiredIndex(
  order: TrainerOrderEntry[],
  run: Run | null,
): number {
  for (let i = 0; i < order.length; i++) {
    if (run?.defeated[i]) continue;
    if (isEffectivelyOptional(order[i], run)) continue;
    return i;
  }
  return -1;
}
