import type { BossMode, Run } from "../types";
import { isEffectivelyOptional } from "./routeChoice";
import { badgeOrderIndices } from "./bossTarget";

/** the level cap in effect right now. The docs list a levelCap on every
 * required trainer, but it's the same number repeated for every trainer
 * between one gym leader and the next (e.g. Misty and the S.S. Anne/Dig
 * House trainers before Lt. Surge all list "27") — it's "the cap you're
 * expected to be under for this fight", not "the cap this fight raises
 * you to". What actually raises the cap is the badge, so only a defeated
 * gym leader lifts the floor (`badgeOrderIndices`); beating an ordinary
 * trainer inside a stretch leaves it where it is.
 *
 * That distinction is the whole point. Letting any defeated trainer raise
 * the floor looks right until you hit a stretch whose *first* fight is not
 * the leader: clearing the Cerulean rival would set the floor to 27, and
 * then every later 27 — Misty included — fails the "exceeds the floor"
 * test and gets skipped, so the pill jumps to Lt. Surge's 34 while Misty
 * is still standing.
 *
 * So: raise the floor on badges only, then return the first remaining
 * required trainer whose cap genuinely exceeds it — not just the next one
 * in list order, which would leave you reading 27 through the post-Misty
 * Dig House/S.S. Anne fights that still say 27. With no run (or nothing
 * defeated), that's the first required trainer's cap. Entries without a
 * numeric cap (blank in the docs) are skipped for the next that has one. */
export function nextLevelCap(modeData: BossMode, run: Run | null): number | undefined {
  const order = modeData.trainerOrder;
  const badges = badgeOrderIndices(modeData);
  let unlocked = 0;
  for (let i = 0; i < order.length; i++) {
    if (isEffectivelyOptional(order[i], run)) continue;
    const cap = parseInt(order[i].levelCap, 10);
    if (Number.isNaN(cap)) continue;
    if (run?.defeated[i]) {
      if (badges.has(i)) unlocked = Math.max(unlocked, cap);
      continue;
    }
    if (cap > unlocked) return cap;
  }
  return unlocked || undefined;
}
