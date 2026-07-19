import type { BossMode, Run } from "../types";

/** the cap of the next undefeated required trainer = the level you play at.
 * With no run, the first required trainer's cap. */
export function nextLevelCap(modeData: BossMode, run: Run | null): number | undefined {
  const order = modeData.trainerOrder;
  for (let i = 0; i < order.length; i++) {
    if (!run?.defeated[i] && !order[i].optional) {
      const cap = parseInt(order[i].levelCap, 10);
      if (!Number.isNaN(cap)) return cap;
    }
  }
  return undefined;
}
