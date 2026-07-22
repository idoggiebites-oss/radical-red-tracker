# Radical Red 4.1 Nuzlocke Tracker

Vite + React + TypeScript SPA, no backend — all run state lives in
`localStorage` (`rr-tracker.v1` plus per-run UI keys like
`rr-tracker.readinessBoss.<runId>`). Deployed to GitHub Pages via GitHub
Actions on push to main (vite `base: '/radical-red-tracker/'`). It's a PWA
(vite-plugin-pwa, autoUpdate, sprites runtime-cached): views are
`React.lazy` chunks so each tab's data/engine loads on demand — keep new
heavy imports (data JSONs, `rr-damage-calc`) out of `App.tsx`, which fetches
`bosses.json` dynamically just for the cap pill/modeData.

## Commands

- `npm run dev` — dev server (http://localhost:5173/radical-red-tracker/)
- `npm run build` — `tsc -b && vite build`; run this to typecheck
- `npm run lint` — oxlint (vendor warnings are noise; `npx oxlint src` for signal)
- `python3 scripts/import_data.py --refresh` — regenerate `src/data/*.json`
  from the official Google Sheets + RR dex data (needs network; cached CSVs
  in `scripts/cache/`, gitignored). Without `--refresh` it re-parses cache.

## Data pipeline (`scripts/import_data.py`)

Sources: official RR 4.1 Google Sheets (locations/bosses/items, CSV export)
and the community RR Pokédex data
(`JwowSquared/Radical-Red-Pokedex/data.js`, a JS object literal parsed with
Python `ast.literal_eval`). Outputs `src/data/encounters.json`,
`bosses.json`, `items.json`, `types.json`. Doc short-form species names
(`-A`, `-G`, `-BM`, Sevii `-S`) resolve through alias tables that exist in
BOTH Python (importer) and TS (`src/lib/sprites.ts`, `src/lib/damagecalc.ts`)
— keep them in sync. Dex base stat array order is HP/ATK/DEF/**SPE**/SPA/SPD.
The importer follows dex evolution edges so evolved forms not in the docs
still get types/stats/abilities (evolution method 254 = mega, excluded), and
emits `spriteIds` maps (species → dex ID in types.json, normalized item name
→ item ID in items.json) used for sprite fallbacks.

## Sprites

`Sprite`/`ItemSprite` chain URLs on 404 and render nothing/fallback at the
end; both reset when the name prop changes. Species: Showdown gen5 →
Showdown dex → RR dex repo `graphics/species/front/<dexID>.png` (covers RR
customs: Sevii forms, custom megas). Items: RR dex `graphics/items/<ID>.png`
→ PokeAPI. Slug rules for Showdown: spaces removed (not dashed), punctuation
and accents stripped, SPECIAL alias map for doc short forms — all in
`src/lib/sprites.ts` / `src/lib/itemSprites.ts`.

## Damage calc

Vendored MIT fork of @smogon/calc from `RadicalRedShowdown/calc` in
`vendor/rrcalc` (local npm package `rr-damage-calc`, gen 9 carries the RR
data; `optimizeDeps.include` required because it's a linked CJS package).
`vendor/rrcalc/index.d.ts` is a minimal HAND-WRITTEN typing — extend it when
using new engine members. Adapter `src/lib/damagecalc.ts`:
`resolveSpecies`/`resolveMove` (never guess a wrong mon — return null),
`defaultBossLevel` ("Highest Lv -3" → level cap − 3), `calcMoves` (desc
lines) and `calcMoveRange` (min/max %), and `ohkoGuard` — the engine does
NOT model Sturdy/Focus Sash, so we flag "survives at 1 HP" ourselves
(multi-hit moves and multi-strike abilities like Parental Bond break
through; Mold Breaker beats Sturdy, not the sash). `SideConditions`/
`toEngineSide()` cover hazards/screens/Tailwind/Leech Seed per side —
`effectiveSpeed()`/`statTotals()`/`bossStatTotals()` take an optional `side`
so Tailwind affects the right Pokémon's Speed. `buildPlayerPokemon`/
`PlayerMonConfig` are fully generic (not player-specific despite the name)
— the Calculator page's Opponent side is built from these too, not from
`buildBossPokemon`/`bossStatTotals`, which now exist only for `MonCard`'s
own read-only stat-table preview.

## App structure

- `src/App.tsx` — tabs (Routes/Bosses/Team/Reference), run switcher, level
  cap pill. Runs live in `AppState.runs`; encounters keyed by location id.
- Pseudo-location ids in `run.encounters`: `starter` (Oak's lab pick — also
  drives rival boss-variant filtering via `src/lib/starters.ts`: the recorded
  ball position `run.starterPos` (0 left/grass · 1 middle/water · 2
  right/fire) maps to a Kanto equivalent, falling back to pre-evolution-chain
  walking for legacy runs; the Routes picker offers regional trios
  (`STARTER_REGIONS`) plus per-slot free-text for randomizers) and
  `static-<species-slug>` ("extra catch" of a static/legendary). Anything stored there flows through Team/builds/
  readiness/evolve automatically.
- `src/views/RoutesView.tsx` — encounter tables per method, starter picker,
  static/legendary capture (`src/lib/statics.ts` matches location names in
  static info text; unmatched ones live in an "OTHER AREAS" row). Multi-floor
  doc locations fold into one nuzlocke area via `src/lib/routeGroups.ts`
  (floor-suffix pattern + explicit merges like Forest Expansion/Safari
  zones); the merged row shares ONE encounter slot — whichever member id the
  run already recorded on, else the first member's id.
- `src/views/BossesView.tsx` — trainer order/level caps + boss teams. Each
  boss Pokémon's "Calc" button calls an `onCalc` prop (threaded down from
  `App.tsx`) instead of opening a dialog — see Calculator below.
- `src/views/TeamView.tsx` — subtabs "Party & Box" (party/box/graveyard, KO
  counters, build editor, Evolve/Devolve via `evolutionsFor`/
  `preEvolutionsFor` in `src/lib/effectiveness.ts`; graveyard entries carry
  post-mortem notes + cause tags — `deathTags`/`deathNote` on
  `RouteEncounter`, editor auto-opens on faint), "Battle readiness"
  (two-column grid areas ph/bh/pc/bc/mu, weather picker seeded from boss
  battle effect, MoveMatchup HP-bar damage grid; its boss-preview `MonCard`s
  use the same `onCalc` prop as BossesView), and "Calculator"
  (`src/components/CalculatorPage.tsx` — see below).
- **Calculator** (`src/components/CalculatorPage.tsx`, Team's third subtab):
  replaced the old per-boss `CalcPanel` modal. Two symmetric, fully-editable
  `PlayerMonConfig` sides (You / Opponent) share one `MonConfigCard`. "You"
  persists to localStorage like before; **Opponent intentionally does not**
  — clicking any boss's "Calc" button (Bosses tab or Battle Readiness) sets
  `App.tsx`'s `calcTarget` (mirrors the existing `bossFocus`/cap-pill
  deep-link pattern: switch tab, set a nonce-stamped target, consuming
  `useEffect` reacts to it) and always fully re-seeds Opponent from that
  Pokémon, discarding any prior edits. A "Load this run's next boss" button
  does the same via `nextRequiredIndex`/`bossTeamFor`. Field conditions
  (hazards/screens/Tailwind/Leech Seed per side) live in the middle "Field"
  card along with weather/terrain/crit/doubles, centered; on desktop
  (`@media (min-width: 901px)`) each side's move-glance `ResultBlock` sits
  above that side's own card via CSS `grid-template-areas` — the JSX itself
  keeps cards before results so mobile's plain single-column stacking
  (no `grid-template-areas` override) is unaffected.
- Shared: `src/components/MonCard.tsx` (boss mon card + `SpeciesDefenses`;
  no longer imports the calculator — just a sprite/stat-table/`onCalc`
  callback), `src/lib/levelCap.ts`.
- Randomizer: manual 🎲 toggles on the Routes toolbar (`run.randomizer`) —
  species opens the catch box to any species and adds optional per-route
  sighting notes (`run.seenSpecies`, keyed `<locId>|<docSpecies>`; the old
  global `run.speciesMap` is legacy, read only for starter identification);
  abilities frees ability inputs in builds/calc
  (`speciesRandomized`/`abilitiesRandomized` in `src/lib/saveFile.ts`).
  Hidden feature: save-file upload (which detects the same flags) behind
  `SAVE_FILE_FEATURE=false` in `src/lib/featureFlags.ts`.

## Conventions & gotchas

- Never define a React component inside another component's render — it
  remounts every keystroke and inputs lose focus (bit us in the build editor).
- `src/app.css` is one global sheet — grep for a class name before adding
  styles; a duplicate `.boss-preview` once silently broke the Bosses tab.
- Comment style: sparse, lowercase, explain non-obvious constraints only.
- Data files in `src/data/` are generated — never hand-edit; change the
  importer and re-run it.
