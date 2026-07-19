# Radical Red 4.1 Nuzlocke Tracker

Local web app for tracking Nuzlocke runs of the Fire Red ROM hack
**Pokémon Radical Red 4.1** — route encounters, team/box/graveyard, boss
battles with full documented sets, and level caps for both Default and
Hardcore/Restricted mode.

All game data is imported from the official community docs:

- [Pokémon Locations & Raid Dens v4.1](https://docs.google.com/spreadsheets/d/15mUFUcN8250hRL7iUOJPX0s1rMcgVuJPuHANioL4o2o)
- [Default Mode Bosses v4.1 (with EVs)](https://docs.google.com/spreadsheets/d/1ES8L4OzeJ8rCuMWFNvrDaZKArqR7Vys2ytFxjx2pbwE)
- [Restricted/Hardcore Mode Info & Hardcore Bosses v4.1](https://docs.google.com/spreadsheets/d/1jDbKFA30xo8csPHZNLtsmqs781bW_Xb9mKoPYyE6KK8)

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
```

Run state (multiple runs, encounters, defeated trainers) is stored in
`localStorage` — no backend needed.

## Re-import data after doc updates

```sh
python3 scripts/import_data.py --refresh
```

Downloads each sheet tab as CSV (cached in `scripts/cache/`), parses the
spreadsheet layouts and regenerates `src/data/encounters.json`,
`src/data/bosses.json` and `src/data/types.json`. The script prints
warnings if the sheet layout changed in a way it doesn't understand.

Type data and the type matchup chart come from the community
[Radical Red Pokédex](https://github.com/JwowSquared/Radical-Red-Pokedex)
(the data behind dex.radicalred.net), so they reflect Radical Red's own
type changes and custom forms (Sevii forms etc.), not vanilla typing.
Every species string that appears in the docs is resolved to its RR dex
entry at import time; unresolved names are reported as warnings.

The Team tab's box can be sorted by any RR base stat (highest Speed,
Attack, …) and filtered by type, using the same dex data. Caught Pokémon
have an **Evolve** button that follows the RR dex evolution data (level,
stone, friendship etc. shown per option, megas excluded) — evolving
updates the mon everywhere while keeping its nickname, build and KO
count, and a devolve option undoes a mis-click.

Boss teams include a type-effectiveness helper: each Pokémon card lists
its weaknesses/resistances/immunities (accounting for defensive
abilities like Levitate, Flash Fire, Storm Drain or Thick Fat), and an
expanded boss shows a "Team is weak to" summary ranking attacking types
by how many team members they hit super-effectively.

## What's in the data

- **encounters.json** — 83 locations (grass/cave day & night, all rods,
  surfing, Safari zones, post-game flagged), plus statics/legendaries,
  gift Pokémon, in-game trades, fossils, the egg vendor, and all 45 raid
  den locations with star ratings and item drop rates.
- **items.json** — full TM/HM list, overworld items by area, Mega Stones
  and Z-Crystals from the Item/TM locations sheet, browsable and
  searchable in the Reference tab.
- **bosses.json** — every documented boss block for both modes (~230
  each), including TM/HM rewards for defeating them (matched from the
  official [Item, TM & Move Tutor Locations sheet](https://docs.google.com/spreadsheets/d/16vBrWJDrsw5QsZyiJjD8ACH7079ZCkQ5BaPtioJOPTk)):
  species, levels (incl. scaling like "Highest Lv -3"), natures,
  abilities, items, movesets, base stats, EV spreads (default mode),
  speed stats incl. weather-boosted values, battle effects (permanent
  weather/terrain), and the full trainer order with level caps.

Sprites are loaded best-effort from Pokémon Showdown's CDN and hidden
when offline or unavailable — the app works fully without them.

## Damage calculator

Boss Pokémon cards have a **Calc** button: the boss side is pre-filled
from the docs (level, nature, ability, item, EVs, moves — with permanent
weather/terrain auto-applied), you enter your Pokémon, and it shows
damage ranges and KO chances both ways. Powered by the vendored engine
from the community's
[Radical Red damage calculator](https://github.com/RadicalRedShowdown/calc)
(MIT, the code behind calc.radicalred.net) in `vendor/rrcalc/`.
