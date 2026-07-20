import type { BossMode } from "../types";

export interface BossTarget {
  category: string;
  title: string;
}

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** doc names abbreviate ("BIRD KE." for BIRD KEEPER) and typo ("RELLI" vs
 * "RELI"), so tokens match on shared prefix or a single edit */
function tokMatch(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a) || withinOneEdit(a, b);
}

function withinOneEdit(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (s.length === l.length) i++;
    j++;
  }
  return true;
}

/** the boss team a trainer-order entry refers to. The order and the category
 * lists both run in game order, so the nth same-named order entry (BROCK,
 * BROCK (REMATCH); the five RIVAL fights) maps to the nth team whose title
 * contains the name's tokens. */
export function bossTeamFor(modeData: BossMode, index: number): BossTarget | null {
  const entry = modeData.trainerOrder[index];
  if (!entry) return null;

  // distinct title groups — starter/back-to-back variants share a title
  const groups: { category: string; title: string; toks: string[] }[] = [];
  for (const cat of modeData.categories) {
    for (const b of cat.bosses) {
      const last = groups[groups.length - 1];
      if (last && last.category === cat.name && last.title === b.title) continue;
      groups.push({ category: cat.name, title: b.title, toks: norm(b.title).split(" ") });
    }
  }

  const key = norm(entry.name);
  const toks = key.split(" ");
  let occ = 0;
  for (let i = 0; i < index; i++) {
    if (norm(modeData.trainerOrder[i].name) === key) occ++;
  }

  let matches = groups.filter((g) =>
    toks.every((tok) => g.toks.some((gt) => tokMatch(gt, tok))),
  );
  if (matches.length === 0) {
    // no title holds every token ("DUMASS CREATOR" is CREATOR · SOUPERCELL):
    // fall back to whichever matches the most
    let best = 0;
    for (const g of groups) {
      const score = toks.filter((tok) => g.toks.some((gt) => tokMatch(gt, tok))).length;
      if (score > best) {
        best = score;
        matches = [g];
      }
    }
  }
  const pick = matches[occ] ?? matches[matches.length - 1];
  return pick ? { category: pick.category, title: pick.title } : null;
}
