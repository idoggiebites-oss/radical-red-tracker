# Radical Red 4.1 Nuzlocke Tracker

Vite + React + TypeScript SPA, no backend — all run state lives in
`localStorage` (`rr-tracker.v1` plus per-run UI keys like
`rr-tracker.readinessBoss.<runId>`). Deployed to GitHub Pages via GitHub
Actions on push to main, served at https://radicalredtracker.com, which is
why vite `base` is `'/'` and not `/<repo-name>/`. The custom domain lives in
the **Pages config**, not in `public/CNAME` — this repo deploys with
`build_type: workflow`, and that mode ignores a CNAME file in the artifact.
Set it with `gh api -X PUT repos/OWNER/REPO/pages -f cname=...` (adding a
domain silently turns `https_enforced` off; turn it back on once
`.https_certificate.state` reaches `approved`). `public/CNAME` is kept only
as a record of the domain in git. It's a PWA
(vite-plugin-pwa, autoUpdate, sprites runtime-cached): views are
`React.lazy` chunks so each tab's data/engine loads on demand — keep new
heavy imports (data JSONs, `rr-damage-calc`) out of `App.tsx`, which fetches
`bosses.json` dynamically just for the cap pill/modeData.

## Commands

- `npm run dev` — dev server (http://localhost:5173/)
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

`learnsets.json` (species → level-up/TM/tutor/egg moves, for the Party & Box
move filter) is keyed off types.json's `spriteIds`, so every alias and
alternate-spelling merge `build_types()` resolved carries over for free. Two
dex quirks it relies on: a species' `tmMoves`/`tutorMoves` are INDICES into
the global tables, not move ids, and pre-evolution level-up moves are already
folded into evolved forms at level 1 (no ancestor walking). Global TM index
`i` is TM `i+1` up to 119 and HM `i-119` above it. The dex shortens seven
move names to fit its own UI ("Drain Kiss", "Soupercell Slam") — `DEX_MOVE_NAMES`
maps them back, or nobody typing the real name would ever match them.

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

Item names and the folding key they share live in `src/lib/itemNames.ts`, not
in the adapter, and it deep-imports `rr-damage-calc/data/items.js` rather than
the package root — importing the adapter for one string lookup pulled the whole
482 kB engine chunk into the `.sav` picker (~200ms of blocking per import).
`damagecalc.ts` re-exports `ITEM_NAMES`/`canonicalItem`/`GEN`, so callers that
already need the engine are unaffected; anything that only needs names should
import from `itemNames.ts` directly.

Item and ability names from the docs go through `resolveItem`/`resolveAbility`,
which `cleanItem`/`cleanAbility` and `isKnownItem`/`isKnownAbility` all share —
the flag must never contradict the calc, which it did (Lt. Surge's Pincurchin
was marked invalid while the calc read its item fine). Order is exact key →
species-specific (`BY_SPECIES`: "Applite" is Flapplite on Flapple-Mega but
Appletunite on Appletun-Mega; "As One" splits by Calyrex forme) → `DOC_ALIASES`
for outright misspellings (Abomasnite, Comotose, Swords of Ruin) → word-by-word
prefix expansion. That last step only runs on names containing a dot, because
the calculator re-resolves on every keystroke and a lone "l" must not equip
Lagging Tail en route to "Life Orb". Matching per word rather than per string
is what reaches mid-name abbreviations — "Corner. Mask", "Hearth. Mask",
"HeavyD. Boots" all resolved to nothing under the old trailing-only
`startsWith`, so those items were silently inert in every calc.

`PlayerMonConfig.types` overrides the dex typing (Protean/Libero, Soak,
Forest's Curse), surfaced as the two type selects on each Calculator card;
undefined means "use the dex", and picking the natural types back clears it
rather than storing a copy, so a species change stays correct. Applying it
is fiddlier than it looks and the shape is forced: assign **both**
`pokemon.types` and `pokemon.species.types` **after** construction, never
via the constructor's `overrides`. `extend()` (vendor/rrcalc/util.js) merges
arrays index-wise into the existing one, so `["Water"]` over Fire/Flying
gives Water/Flying — and because `calc()` clones both Pokémon before every
calculation, replaying `overrides: this.species` through that same merge, a
shorter array grows its old second type back on the first clone. Dropping a
type therefore pads the slot with `""`, which the mechanics already treat as
absent (`gen789.js` guards on `defender.types[1] ?`). A 2→1 override is the
only case that exposes this; 1→1 swaps pass either way.

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
  **Fights with more than one possible team** (the Elite Four's TEAM ONE/TWO
  and Lorelei's RAIN/SNOW TEAM, Bugsy either side of Lt. Surge, Jasmine/
  Pryce, Ketchup's rematch) go through `src/lib/bossVariants.ts` —
  `chosenBoss()` is the single resolver, and the pick lives on
  `run.bossTeam` keyed `"<category>|<title>"`. Use it anywhere a
  `BossTarget` becomes a real team: BossesView's row, Battle Readiness's
  auto-select and the Calculator's next-boss seeding all call it, and they
  must agree or the app preps for a team the row isn't showing. The rival's
  starter variants are a different mechanism — `bossMatchesStarter` filters
  those to one before `chosenBoss` ever sees them, which is why the champion
  offers no picker. Readiness's auto-follow guard is keyed on the order index
  **and** the chosen variant; index alone bails when you switch teams,
  because switching doesn't advance the frontier.
- `src/views/TeamView.tsx` — subtabs "Party & Box" (party/box/graveyard, KO
  counters, build editor, Evolve/Devolve via `evolutionsFor`/
  `preEvolutionsFor` in `src/lib/effectiveness.ts`; graveyard entries carry
  post-mortem notes + cause tags — `deathTags`/`deathNote` on
  `RouteEncounter`, editor auto-opens on faint; the "Can learn" filter is
  `src/lib/learnsets.ts` — the ~500 kB table is a dynamic `import()` fetched
  only once a move is typed, so **never import it statically**, and the
  filter stays off until it lands. A half-typed move is not a filter: it
  applies only once the text names exactly one move, by full name or
  unambiguous prefix, or every section would empty out on "ear". A build
  that already lists the move matches even when the dex disagrees —
  randomized learnsets are a real run setting (`learnsetsRandomized`, which
  the toolbar warns about) and the dex has gaps), "Battle readiness"
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
- `src/views/ReferenceView.tsx` — segmented subtabs over one shared filter
  box and the `Chunked` lazy-render helper. **Pokédex** (first, and the
  default) lists all 1247 species from `src/lib/dex.ts`, expanding in place
  like the Team tab's collapsed rows. Its point is **abilities**: the game
  stores none, it recomputes them from the trainer id, so with a save
  imported `abilityRollFor(run)` replays that hash (`src/lib/
  abilityRandomizer.ts`) and the whole dex shows the run's REAL abilities,
  base struck through. Only abilities are recoverable — species
  randomization looks like a seeded shuffle and was shelved, the learnset
  randomizer's mapping is unknown — so `dexCaveats()` prints what the tab
  can't answer instead of passing dex defaults off as facts. This is why
  `ReferenceView` takes a `run` prop at all. `dex.ts` also builds the
  reverse indexes the docs have no equivalent of (species → where to catch
  it, species → which bosses field it). The boss index and the learnset
  table are big chunks (602 kB / 415 kB), and each waits for the thing that
  needs it: the boss index on the first expand, the learnset table on the
  first time the collapsed Learnset block is opened. Loading either on
  mount would make every visit to Reference pay for it just to read Items.
  The learnset block's open state lives on the tab, not the entry, so
  browsing species to species doesn't mean re-opening it.
- Shared: `src/components/MonCard.tsx` (boss mon card; imports the
  calculator for its stat-table preview), `src/lib/levelCap.ts`.
  **`SpeciesDefenses` lives in its own file**, not in MonCard, precisely
  because MonCard pulls the 484 kB engine chunk and the Pokédex wants the
  type chips and nothing else — same trap as `itemNames` vs `damagecalc`.
  `METHOD_LABELS` is in `src/lib/methods.ts` so Routes and the Pokédex
  can't name the same encounter slot differently.
- Randomizer: manual 🎲 toggles on the Routes toolbar (`run.randomizer`) —
  species opens the catch box to any species and hides the wild-encounter
  tables (the doc species aren't real options once anything can appear);
  abilities frees ability inputs in builds/calc
  (`speciesRandomized`/`abilitiesRandomized` in `src/lib/saveFile.ts`). The
  old global `run.speciesMap` is legacy, read only for starter
  identification. There was a per-route sighting log (`run.seenSpecies`,
  a "→ record" cell in each encounter table) — removed, because it needed
  the tables that a randomized run hides, so it could never render. Old runs
  may still carry `seenSpecies` data; nothing reads it. The save-file upload
  detects the same flags (`SAVE_FILE_FEATURE` in `src/lib/featureFlags.ts`,
  now on).
- **Re-importing a save into a run already in progress** (cog menu → "Update
  from save", `SyncSaveDialog` in `App.tsx`) goes through
  `mergeEncounters()` in `saveImport.ts`, never `encountersFrom()` — the
  latter builds a fresh map and would wipe KO counts, graveyard notes and
  status marks. The line is what the game records vs what only the player
  knows: species (so evolutions land), nickname, ability, item, nature,
  moves and party membership come from the save; `status`, `kos`,
  `deathTags` and `deathNote` are never touched, and locations the save
  doesn't cover are left alone and merely reported. **The trap worth
  knowing:** the box's compact 58-byte entry carries no EV data at all
  (`parseBoxMon` returns `evs: {}`), so a blanket refresh silently zeroes
  EVs typed in for anything currently boxed — `hasEvData()` distinguishes
  "the save doesn't know" from "the save says zero". A run started by hand
  can attach a save this way later; `saveInfo` is refreshed on apply, and a
  mismatched trainer name is flagged rather than blocked.

## Release notes ("What's new")

`CHANGELOG.md` at the repo root is player-facing release notes, read by
`src/lib/changelog.ts` via a `?raw` import — inlined at build time, so there
is no generator and no generated file to drift. It deliberately does NOT read
git: CI checks out shallow (`actions/checkout` with no `fetch-depth`), so
anything shelling out to `git log` there would silently see one commit.

**Add entries at the top; never renumber.** Notes are numbered by counting up
from the oldest, so published notes keep their id only while new entries go
on top. Renumbering re-shows old notes to everyone.

The panel is keyed on **what the reader has already seen**
(`rr-tracker.lastSeenNote`), not on the build. That is the whole design:
every push deploys, and a busy day here runs to 17 pushes, so a per-deploy
popup would fire all day. Batching by last-seen gives one panel per visit
however many times we shipped in between. Only user-visible work belongs in
the file; refactors and chunking go in the commit message.

A reader with **no stored position** is split two ways, because "we have
never recorded you" means opposite things for a player who predates the
panel and one opening the app for the first time. `HAD_STATE_AT_STARTUP`
(is `rr-tracker.v1` already in localStorage, read at *module load* — App's
own save effect would otherwise create the key and erase the distinction)
picks between `BACKFILL_FROM`, so an existing player is told about the work
they missed, and the newest note, so a new player is told nothing about an
app they have never seen. The position is written on the way in, not on
dismiss, so it can't be re-derived on a later visit once that signal no
longer means what it did.

## Conventions & gotchas

- Never define a React component inside another component's render — it
  remounts every keystroke and inputs lose focus (bit us in the build editor).
- `src/app.css` is one global sheet — grep for a class name before adding
  styles; a duplicate `.boss-preview` once silently broke the Bosses tab.
- Comment style: sparse, lowercase, explain non-obvious constraints only.
- Data files in `src/data/` are generated — never hand-edit; change the
  importer and re-run it.
- The mobile nav bar is `position: fixed`, and `overscroll-behavior-y:
  none` (html + body) kills the iOS elastic bounce that otherwise drags it
  off the screen edge mid-rubber-band. That also removes pull-to-refresh —
  the settings-cog "Check for update" (`src/lib/appUpdate.ts`) is the
  replacement reload path for the installed PWA, which has no address bar.
  The two are a pair: don't remove either without reconsidering the other.
- Don't reposition fixed elements from `window.visualViewport` geometry.
  A long "nav bar detaches on iOS" hunt turned out to be WebKit bug 297779
  — on iOS 26.0 `visualViewport.offsetTop` doesn't reset to 0 after the
  keyboard is dismissed, so `position: fixed` elements are left misplaced.
  Apple fixed it in 26.x; verified gone on 26.5. Five in-app fixes failed
  because they all read the API the platform bug corrupts. If a viewport
  bug reproduces only on one OS build, check the user's version and search
  for a known WebKit bug before writing code.
