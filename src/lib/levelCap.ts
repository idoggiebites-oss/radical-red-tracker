import type { BossMode, Run } from "../types";
import { isEffectivelyOptional } from "./routeChoice";

/** the cap of the next undefeated required trainer = the level you play at.
 * With no run, the first required trainer's cap. Entries without a numeric
 * cap (blank in the docs) are skipped in favor of the next one that has one. */
export function nextLevelCap(modeData: BossMode, run: Run | null): number | undefined {
  const order = modeData.trainerOrder;
  for (let i = 0; i < order.length; i++) {
    if (run?.defeated[i] || isEffectivelyOptional(order[i], run)) continue;
    const cap = parseInt(order[i].levelCap, 10);
    if (!Number.isNaN(cap)) return cap;
  }
  return undefined;
}
