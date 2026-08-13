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
