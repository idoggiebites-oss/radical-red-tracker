import type { BossMode, Run } from "../types";
import { isEffectivelyOptional } from "./routeChoice";

/** the level cap in effect right now. The docs list a levelCap on every
 * required trainer, but it's the same number repeated for every trainer
 * between one gym leader and the next (e.g. Misty and the S.S. Anne/Dig
 * House trainers before Lt. Surge all list "27") — it's "the cap you're
 * expected to be under for this fight", not "the cap this fight raises
 * you to". So the cap only actually rises once you clear the highest-cap
 * trainer in that stretch (typically the gym leader); beating an earlier
 * same-cap trainer shouldn't gate you back down to a number you've
 * already cleared. Tracks the highest cap among defeated required
 * trainers, then returns the first remaining required trainer whose cap
 * genuinely exceeds that — not just the next one in list order. With no
 * run (or nothing defeated yet), that's just the first required trainer's
 * cap, same as before. Entries without a numeric cap (blank in the docs)
 * are skipped in favor of the next one that has one. */
export function nextLevelCap(modeData: BossMode, run: Run | null): number | undefined {
  const order = modeData.trainerOrder;
  let unlocked = 0;
  for (let i = 0; i < order.length; i++) {
    if (isEffectivelyOptional(order[i], run)) continue;
    const cap = parseInt(order[i].levelCap, 10);
    if (Number.isNaN(cap)) continue;
    if (run?.defeated[i]) {
      unlocked = Math.max(unlocked, cap);
      continue;
    }
    if (cap > unlocked) return cap;
  }
  return unlocked || undefined;
}
