/** The vendored engine ships one `index.d.ts` for its root entry only, so
 * the deep imports it also supports have no types. Declared here rather
 * than edited into vendor/ so a re-vendor doesn't drop them. */
declare module "rr-damage-calc/data/items.js" {
  /** item names per generation index */
  export const ITEMS: readonly (readonly string[])[];
}
