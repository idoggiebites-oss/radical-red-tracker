import type { BossMode } from "../types";

export interface BossTarget {
  category: string;
  title: string;
}

/** back-to-back info for a trainer-order entry, from the docs' "(!) BACK TO
 * BACK" annotations on the boss lists */
export interface ChainInfo {
  /** fought immediately after the previous order entry, no healing between */
  withPrev: boolean;
  /** one order entry, two teams fought in a row (Oak's back-to-back fight) */
  double: boolean;
}

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** doc names abbreviate ("BIRD KE." for BIRD KEEPER) and typo ("RELLI" vs
 * "RELI"), so tokens match on shared prefix or a single edit; numbers
 * (route numbers) must match exactly so ROUTE 1 can't claim ROUTE 16, and a
 * single-letter token ("S" from "S.S. ANNE") is too short to mean anything
 * as a prefix — it'll spuriously match "SAFARI", "SABRINA", anything */
function tokMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  if (a.length < 2 || b.length < 2) return false;
  return a.startsWith(b) || b.startsWith(a) || withinOneEdit(a, b);
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

interface Group {
  category: string;
  title: string;
  toks: string[];
  chainPrev: boolean;
  double: boolean;
}

/** distinct title groups — starter/back-to-back variants share a title. A
 * chained FIRST variant chains the group to the previous boss; a chained
 * LATER variant means the group itself is a two-team gauntlet. */
function buildGroups(modeData: BossMode): Group[] {
  const groups: Group[] = [];
  for (const cat of modeData.categories) {
    for (const b of cat.bosses) {
      const last = groups[groups.length - 1];
      if (last && last.category === cat.name && last.title === b.title) {
        if (b.chained) last.double = true;
        continue;
      }
      groups.push({
        category: cat.name,
        title: b.title,
        toks: norm(b.title).split(" "),
        chainPrev: !!b.chained,
        double: false,
      });
    }
  }
  return groups;
}

const locScore = (g: Group, locToks: string[]) =>
  locToks.filter((lt) => g.toks.some((gt) => tokMatch(gt, lt))).length;

/** map every trainer-order entry to its boss team group. Same-named trainers
 * at different places (the GIOVANNI fights, ARIANA at Silph vs Cerulean
 * Cave) are told apart by location score, which usually narrows straight to
 * one team. When it can't — a location the doc never titles a team after,
 * like the pre-Koga "SAFARI ZONE" Brendan fight, whose real team is titled
 * "FUCHSIA CITY" — fall back to pure name order: the order and category
 * lists both run in game order, so the nth same-named entry overall maps to
 * the nth team whose title holds the name's tokens. */
function resolveOrder(modeData: BossMode): (Group | null)[] {
  const groups = buildGroups(modeData);
  const seen: Record<string, number> = {};
  return modeData.trainerOrder.map((t) => {
    const toks = norm(t.name).split(" ");
    const locToks = norm(t.location ?? "").split(" ").filter(Boolean);
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
    } else if (matches.length > 1 && locToks.length > 0) {
      const best = Math.max(...matches.map((g) => locScore(g, locToks)));
      // a real location match narrows to one team regardless of name-order
      // below; a tie (nobody scores above 0) leaves the full set untouched
      if (best > 0) matches = matches.filter((g) => locScore(g, locToks) === best);
    }
    const okey = toks.join(" ");
    const occ = (seen[okey] = (seen[okey] ?? -1) + 1);
    return matches[occ] ?? matches[matches.length - 1] ?? null;
  });
}

/** the boss team the trainer-order entry at `index` refers to */
export function bossTeamFor(modeData: BossMode, index: number): BossTarget | null {
  const g = resolveOrder(modeData)[index];
  return g ? { category: g.category, title: g.title } : null;
}

/** back-to-back chains per trainer-order index (absent = a normal fight).
 * `withPrev` is only true on the second+ fight of a chain — used to walk
 * forward from the first fight (see App.tsx's cap-pill chain count). The
 * first fight itself is still in this map (withPrev: false) so callers that
 * just want "is this fight part of a back-to-back run" (badges) can use
 * presence alone, without missing the opening fight. */
export function orderChainInfo(modeData: BossMode): Map<number, ChainInfo> {
  const out = new Map<number, ChainInfo>();
  resolveOrder(modeData).forEach((g, i) => {
    if (g && (g.chainPrev || g.double)) {
      out.set(i, { withPrev: g.chainPrev, double: g.double });
      if (g.chainPrev && i > 0 && !out.has(i - 1)) {
        out.set(i - 1, { withPrev: false, double: false });
      }
    }
  });
  return out;
}
