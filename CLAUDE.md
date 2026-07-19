# Radical Red 4.1 Nuzlocke Tracker

Vite + React + TypeScript SPA, no backend — all run state lives in
`localStorage` (`rr-tracker.v1` plus per-run UI keys like
`rr-tracker.readinessBoss.<runId>`). Deployed to GitHub Pages via GitHub
Actions on push to main (vite `base: '/radical-red-tracker/'`).

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
(multi-hit moves break through; Mold Breaker beats Sturdy, not the sash).

## App structure

- `src/App.tsx` — tabs (Routes/Bosses/Team/Reference), run switcher, level
  cap pill. Runs live in `AppState.runs`; encounters keyed by location id.
- Pseudo-location ids in `run.encounters`: `starter` (Oak's lab pick — also
  drives rival boss-variant filtering via `src/lib/starters.ts`, which walks
  pre-evolution chains) and `static-<species-slug>` ("extra catch" of a
  static/legendary). Anything stored there flows through Team/builds/
  readiness/evolve automatically.
- `src/views/RoutesView.tsx` — encounter tables per method, starter picker,
  static/legendary capture (`src/lib/statics.ts` matches location names in
  static info text; unmatched ones live in an "OTHER AREAS" row).
- `src/views/BossesView.tsx` — trainer order/level caps + boss teams.
- `src/views/TeamView.tsx` — subtabs "Party & Box" (party/box/graveyard, KO
  counters, build editor, Evolve/Devolve via `evolutionsFor`/
  `preEvolutionsFor` in `src/lib/effectiveness.ts`; graveyard entries carry
  post-mortem notes + cause tags — `deathTags`/`deathNote` on
  `RouteEncounter`, editor auto-opens on faint) and "Battle readiness"
  (two-column grid areas ph/bh/pc/bc/mu, weather picker seeded from boss
  battle effect, MoveMatchup HP-bar damage grid).
- Shared: `src/components/MonCard.tsx` (boss mon card + `SpeciesDefenses`),
  `CalcPanel.tsx` (full calculator dialog), `src/lib/levelCap.ts`.
- Hidden feature: save-file upload + randomizer mapping behind
  `SAVE_FILE_FEATURE=false` in `src/lib/featureFlags.ts`.

## Conventions & gotchas

- Never define a React component inside another component's render — it
  remounts every keystroke and inputs lose focus (bit us in the build editor).
- `src/app.css` is one global sheet — grep for a class name before adding
  styles; a duplicate `.boss-preview` once silently broke the Bosses tab.
- Comment style: sparse, lowercase, explain non-obvious constraints only.
- Data files in `src/data/` are generated — never hand-edit; change the
  importer and re-run it.
