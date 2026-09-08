# What's new

Player-facing release notes. The app reads this file directly (inlined at
build time) and shows a returning player anything added since their last
visit — so write for someone playing the game, not for someone reading the
diff. Internal work (refactors, chunking, CI) belongs in the commit message
and nowhere near this file.

**Add new entries at the TOP.** Notes are numbered by counting up from the
oldest, so anything already published keeps its number as long as new
entries only go on top. Renumbering would re-show old notes to everyone.

A bullet under a `## date` heading is one note. Everything else here is
ignored by the parser.

## 2026-09-08

- **Sixteen boss pages**, one per major fight: Brock through Clair, the whole
  Elite Four, the Champion's three starter teams, Giovanni's three fights and
  the Rocket admins. Each one has both modes' teams, the level cap, what the
  fight's conditions are, and the team's weaknesses counted up.
- **Eight location pages** — Viridian Forest, Mt. Moon, Route 3, Rock Tunnel,
  Pokémon Tower, the Safari Zone, Seafoam Islands and Cerulean Cave — with
  their encounters, the items and TMs found there, the raid dens and the
  trainers waiting in them.
- New reference pages for **TM locations**, **Mega Stones and Z-Crystals**,
  **raid dens** (every den, its Pokémon and their drops) and **how every
  Pokémon evolves** in Radical Red.

## 2026-09-07

- The tracker now has **reference pages that stand on their own** — level
  caps, every boss team in battle order, the Elite Four with all their
  alternate lineups, and full pages for Giovanni and Sabrina with every move,
  ability, held item and the team's weaknesses worked out. They open without
  the tracker, so you can send one to whoever you are comparing notes with.
  The links are at the bottom of this page.
- **Every documented encounter, on one page**: all 83 areas with the rate and
  level range for each slot, day and night grass tables, the three rods and
  surfing, plus the static encounters, gifts, trades, fossils and egg shards.
  Same for items — all 120 TMs with what they teach, the Mega Stones,
  Z-Crystals and the overworld items area by area.
- Every fight on those pages has a button that drops it straight into
  **Battle Readiness or the damage calculator** against your own run, so
  reading a boss's team and checking your party against it is one click
  apart.

## 2026-09-06

- The Pokédex has a **"Can learn" search**: type a move and it narrows to the
  Pokémon that can learn it, each tagged with how — the level, the TM number,
  tutor or egg. The same search Party & Box already had, now across the whole
  dex.
- On a run with the ability randomizer, searching the Pokédex for an ability
  no longer turns up Pokémon that only have it in the unrandomized game. It
  lists the ones that actually have it in your run.
- Scrolling on a wide screen no longer jumps: the bottom tab bar now fades in
  once the top row scrolls away, instead of the row itself leaping down to the
  bottom of the window and dragging the page with it. Settling right on the
  point where it changed over used to flip it back and forth.

## 2026-08-13

- Pokémon entries in the Pokédex now start with the learnset folded away, so
  the rest of the entry fits on one screen.

## 2026-08-12

- The Reference tab has a **Pokédex**: every Pokémon, with its stats, type
  matchups, evolutions, where to catch it and which bosses bring it.
- If you imported a save from a run with the ability randomizer on, the
  Pokédex shows that run's **real abilities** — not the defaults — for every
  Pokémon in the game, with the original struck through.
- Party & Box has a **"Can learn" search**: type a move and it narrows to the
  Pokémon that can learn it, with a tag saying how — the level, the TM
  number, tutor, or egg. Anything already carrying the move is marked.

## 2026-08-09

- The tab bar takes a press and slide: hold anywhere on it and the highlight
  follows your finger, switching only when you lift.
- The bars and overlays picked up a translucent finish.

## 2026-08-08

- Fixed a tab occasionally opening blank when an update landed while the app
  was still open. It now recovers on its own instead of needing a reload.
