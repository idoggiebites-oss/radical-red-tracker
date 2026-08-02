/** Item names and the name-folding key, split out of `damagecalc.ts` on
 * purpose: the save reader needs `canonicalItem` and nothing else from the
 * engine, and importing the adapter dragged the whole 493 kB damage-calc
 * chunk into the interaction that picks a `.sav` file (232ms of load+eval
 * at 4x CPU, ~90% of the reader's cost, for a string lookup). Reaching
 * straight into the vendored data module pulls items.js + util.js only.
 *
 * `damagecalc.ts` re-exports ITEM_NAMES from here, so there is still one
 * spelling of the list for the whole app. */

// deep import into the vendored package: index.js re-exports this very same
// array, so the names are identical, but going through it drags the engine in
import { ITEMS } from "rr-damage-calc/data/items.js";
import { GEN } from "./gen";

/** deduped — the vendored data has at least one real duplicate (Mountaineer:
 * once in the inherited base-game list, again in the RR-specific additions),
 * which broke every <datalist>/<select> built from it with a React
 * duplicate-key warning */
export const ITEM_NAMES: string[] = [...new Set(ITEMS[GEN] ?? [])].sort();

/** the engine compares items by exact string (`hasItem` is an includes()
 * against names like "Choice Band"), so anything typed by hand has to be
 * folded back to the engine's own spelling first — case, spacing,
 * punctuation and accents all differ harmlessly to a human and fatally to
 * the lookup, and a miss applies NOTHING while looking accepted */
export const itemKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const ITEM_BY_KEY = new Map(ITEM_NAMES.map((n) => [itemKey(n), n]));

/** exact match ignoring case/spacing/punctuation; undefined when unknown */
export function matchItemName(item: string): string | undefined {
  return ITEM_BY_KEY.get(itemKey(item));
}

/** the engine's own spelling of an item, ignoring case/spacing/punctuation;
 * undefined when unknown. Used by the save reader to turn a normalized item
 * name from the id table into the name the rest of the app displays. */
export function canonicalItem(item: string): string | undefined {
  return matchItemName(item);
}
