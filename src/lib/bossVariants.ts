/** Fights that can bring more than one team.
 *
 * Several trainers have two or three teams in the docs and the game picks
 * between them: the Elite Four (TEAM ONE/TEAM TWO, and Lorelei's RAIN TEAM/
 * SNOW TEAM), Bugsy either side of Lt. Surge, Jasmine/Pryce, Ketchup's
 * rematch. Each of those is a single row in the trainer order, so the row
 * has to choose one — it used to take whichever came first in the sheet,
 * which left the other team reachable only from the off-path section.
 *
 * The rival's starter-dependent variants are NOT this: those are filtered
 * down to one by `bossMatchesStarter` before we ever get here, so the
 * champion offers no choice once the run's starter is known. */
import type { Boss, BossMode, Run } from "../types";
import { bossMatchesStarter } from "./starters";

/** identifies a fight across both of its coordinates — titles repeat between
 * categories (BROCK is in Kanto Leaders and Kanto Rematch) */
export function variantKey(category: string, title: string): string {
  return `${category}|${title}`;
}

/** every team this fight could bring, already narrowed by the run's starter.
 * Length > 1 is exactly the condition for offering a choice. */
export function bossVariants(
  modeData: BossMode,
  category: string,
  title: string,
  rivalStarter: string | null,
): Boss[] {
  const cat = modeData.categories.find((c) => c.name === category);
  return (cat?.bosses ?? []).filter(
    (b) => b.title === title && bossMatchesStarter(b.subtitle, rivalStarter),
  );
}

/** the run's pick for this fight, clamped to what actually exists so a
 * stale choice from an older data import can't strand the row on nothing */
export function chosenVariantIndex(
  run: Run | null,
  category: string,
  title: string,
  count: number,
): number {
  const i = run?.bossTeam?.[variantKey(category, title)] ?? 0;
  return i >= 0 && i < count ? i : 0;
}

/** the team to show for this fight, honouring the run's pick */
export function chosenBoss(
  modeData: BossMode,
  run: Run | null,
  category: string,
  title: string,
  rivalStarter: string | null,
): { boss: Boss; index: number; variants: Boss[] } | null {
  const variants = bossVariants(modeData, category, title, rivalStarter);
  if (variants.length === 0) return null;
  const index = chosenVariantIndex(run, category, title, variants.length);
  return { boss: variants[index], index, variants };
}

/** what to call a variant in the picker. The docs name most of them
 * ("TEAM ONE", "RAIN TEAM", "PRE LT. SURGE"); the numbered fallback is only
 * for a fight whose blocks the sheet left unlabelled. */
export function variantLabel(boss: Boss, index: number): string {
  return boss.subtitle?.trim() || `TEAM ${index + 1}`;
}

/** run state updater for picking a team */
export function withBossTeam(
  run: Run,
  category: string,
  title: string,
  index: number,
): Run {
  return {
    ...run,
    bossTeam: { ...run.bossTeam, [variantKey(category, title)]: index },
  };
}
