/** The three pages about what the tracker does rather than what the game
 * contains. Every capability claimed here was checked against the code that
 * implements it (src/lib/damagecalc.ts, TeamView's readiness section,
 * src/lib/saveFile.ts + saveImport.ts) — a feature page that oversells is
 * worse than no page, because the visitor finds out in one click. */
import { shell } from "./render.mjs";

const faq = (pairs) => [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  },
];

export function calculatorPage() {
  return shell({
    path: "/damage-calculator",
    title: "Radical Red 4.1 Damage Calculator — Mobile Friendly",
    description:
      "Mobile-friendly Radical Red 4.1 damage calculator with documented boss sets, weather, terrain, items, abilities and damage ranges both ways.",
    h1: "Radical Red Damage Calculator",
    crumbs: [["/damage-calculator", "Damage calculator"]],
    jsonLd: faq([
      [
        "Does this calculator use Radical Red's data?",
        "Yes. It runs a fork of the Showdown damage engine carrying Radical Red 4.1's own species, moves, abilities and items, so the numbers match the ROM hack rather than the base games.",
      ],
      [
        "Can I load a boss's real team?",
        "Yes. Every documented boss set can be loaded into the Opponent side from the boss pages or the Bosses tab, at the level the docs give it.",
      ],
      [
        "Does it work on a phone?",
        "Yes. The whole tracker is built mobile-first and installs as a web app; the calculator's two sides stack on a narrow screen.",
      ],
    ]),
    body: `<p class="lede">A damage calculator that already knows Radical Red
4.1 — its species, its move list, its abilities and items, and every
documented boss set. Pick a fight, load the team you are about to face, and
read the ranges in both directions on your phone while the game is paused.</p>
<p><a class="cta" href="/?to=calc">Open the damage calculator</a>
<a class="cta ghost" href="/bosses">Load a boss team</a></p>

<h2>What it models</h2>
<div class="scroll"><table>
<thead><tr><th>Fed in</th><th>What it does</th></tr></thead>
<tbody>
<tr><th>Radical Red 4.1 data</th><td>A fork of the Showdown engine carrying RR's
own dex, moves, abilities and items — not the base-game numbers with a
different name on them.</td></tr>
<tr><th>Documented boss sets</th><td>Any boss's six, at their documented level,
ability, nature, EVs and held item. Loaded from a boss page or the Bosses
tab; the level a fight uses follows your run's cap where the docs say
"highest level −3".</td></tr>
<tr><th>Both directions</th><td>Your damage to them and theirs to you, side by
side, so "can I take the hit" is answered at the same time as "can I KO
it".</td></tr>
<tr><th>Weather and terrain</th><td>Set by hand or seeded from the fight —
several bosses run permanent Trick Room, rain or snow, and the sets they
bring only make sense under it.</td></tr>
<tr><th>Field conditions</th><td>Hazards, screens, Tailwind and Leech Seed,
per side, so Speed and damage both account for what is already on the
field.</td></tr>
<tr><th>Sturdy and Focus Sash</th><td>Flagged separately as "survives at 1 HP",
because the engine does not model them — multi-hit moves and Parental Bond
break through, and Mold Breaker beats Sturdy but not the Sash.</td></tr>
<tr><th>Type overrides</th><td>Protean, Libero, Soak and Forest's Curse change
what a Pokémon <em>is</em>; both sides let you set the typing the calculation
should use.</td></tr>
</tbody></table></div>

<h2>Where it fits</h2>
<p>The calculator is one Pokémon against one Pokémon, which is the right tool
when you are deciding a single turn. When the question is the whole fight —
which of your six can do anything at all against their six — that is
<a href="/battle-readiness">Battle Readiness</a>, and it runs the same engine
across every pairing at once.</p>
<div class="card">
<h3>Start from a fight</h3>
<p>Boss sets load in one click from any of these:</p>
<a class="cta ghost" href="/bosses/sabrina">Sabrina</a>
<a class="cta ghost" href="/bosses/giovanni">Giovanni</a>
<a class="cta ghost" href="/elite-four">Elite Four</a>
<a class="cta ghost" href="/bosses">Every boss</a>
</div>`,
  });
}

export function readinessPage() {
  return shell({
    path: "/battle-readiness",
    title: "Radical Red Battle Readiness — Boss Matchup Planner",
    description:
      "Compare every Pokémon on your team against an entire Radical Red boss team, with damage ranges both ways and a matchup grid per boss.",
    h1: "Radical Red Boss Matchup Planner",
    crumbs: [["/battle-readiness", "Battle readiness"]],
    jsonLd: faq([
      [
        "What does Battle Readiness do?",
        "It runs every Pokémon in your party against every Pokémon on a Radical Red boss's team, in both directions, and shows the damage ranges as a grid so you can see which of your team can do anything about which of theirs.",
      ],
      [
        "Do I have to enter my team by hand?",
        "No. Importing your Radical Red .sav fills in your party and box with their real levels, natures, abilities, items and moves.",
      ],
    ]),
    body: `<p class="lede">A damage calculator answers one Pokémon against one
Pokémon. Battle Readiness answers the fight: every Pokémon in your party
against all six of a boss's, in both directions, in one grid.</p>
<p><a class="cta" href="/?to=readiness">Analyze my team</a>
<a class="cta ghost" href="/save-import">Import your save first</a></p>

<h2>The difference</h2>
<p>A boss guide can tell you that Sabrina brings Hatterene, Indeedee-F, Brute
Bonnet, Porygon2, Ursaluna and a Mega Gardevoir. It cannot tell you whether
<em>your</em> Ampharos survives a Moonblast, or which of your six outspeeds
under her Trick Room. That is a different question, and it needs your actual
team.</p>
<div class="scroll"><table>
<thead><tr><th></th><th>Damage calculator</th><th>Battle Readiness</th></tr></thead>
<tbody>
<tr><th>Scope</th><td>One matchup</td><td>Your whole party against their whole team</td></tr>
<tr><th>Answers</th><td>Exact ranges for a turn you are planning</td><td>Which pairings are winnable at all</td></tr>
<tr><th>Team</th><td>Whatever you type in</td><td>Your run's party, from your save</td></tr>
<tr><th>Conditions</th><td>Set by hand</td><td>Seeded from the fight — its weather, terrain and doubles</td></tr>
</tbody></table></div>

<h2>How it works</h2>
<ol>
<li>Import your <a href="/save-import">Radical Red save</a>, or record your
catches as you go. Either way the tracker knows your party.</li>
<li>Open Battle Readiness. It follows your run — the fight it opens on is the
one your <a href="/level-caps">level cap</a> is counting toward.</li>
<li>Read the grid: each of your Pokémon against each of theirs, damage both
ways, with the fight's own weather and terrain already applied.</li>
<li>Send any single pairing to the <a href="/damage-calculator">damage
calculator</a> when you want to change one variable and watch the number
move.</li>
</ol>
<div class="card">
<h3>Check a fight you are stuck on</h3>
<a class="cta" href="/?cat=kanto-leaders&boss=gym-leader-sabrina&to=readiness">My team vs Sabrina</a>
<a class="cta ghost" href="/bosses">Pick another boss</a>
</div>`,
  });
}

export function saveImportPage() {
  return shell({
    path: "/save-import",
    title: "Import Your Radical Red .sav — Team & Nuzlocke Tracker",
    description:
      "Import your Radical Red .sav in your browser to fill in your team, box and Nuzlocke tracker. The file is read on your device and never uploaded.",
    h1: "Radical Red Save File Import",
    crumbs: [["/save-import", "Save import"]],
    jsonLd: faq([
      [
        "Is my save file uploaded anywhere?",
        "No. The tracker has no server. Your .sav is read in the browser and everything it produces is stored in that browser's own storage.",
      ],
      [
        "What does it read from the save?",
        "Species, nickname, level, nature, ability, held item, moves, EVs and IVs for your party and box, plus your trainer name and whether the run is Hardcore, restricted, or has the ability, learnset or species randomizers on.",
      ],
      [
        "Which files work?",
        "The .sav your emulator writes, and the .sa2 and .fla variants some emulators use.",
      ],
    ]),
    body: `<p class="lede">Rather than retyping six Pokémon and their levels,
natures, abilities, items and moves, hand the tracker the save file your
emulator already wrote. It reads your party and box straight out of it.</p>
<p><a class="cta" href="/">Import my save</a></p>

<div class="card">
<h3>Your save never leaves your device</h3>
<p>There is no server to send it to — this is a static site, and the file is
read in your browser and parsed there. What comes out of it is stored in that
browser's own storage, on that device, and nothing about your run is
transmitted anywhere.</p>
</div>

<h2>How it works</h2>
<ol>
<li>Find the save your emulator writes next to the ROM — <code>.sav</code>,
or <code>.sa2</code> or <code>.fla</code> depending on the emulator.</li>
<li>Open the tracker and choose it. Nothing is uploaded; the file is read
where it sits.</li>
<li>Your party and box appear, each Pokémon with its real level, nature,
ability, held item, moves, EVs and IVs.</li>
<li>The run's own settings come across too: Hardcore mode, restricted mode,
and whether the ability, learnset or species randomizers are on — which
changes what the rest of the tracker is willing to tell you.</li>
<li>From there your real team feeds
<a href="/battle-readiness">Battle Readiness</a> and the
<a href="/damage-calculator">damage calculator</a> against any
<a href="/bosses">boss team</a>.</li>
</ol>

<h2>Importing again later</h2>
<p>A run already in progress can be refreshed from a newer save, and the line
it draws is what the game knows versus what only you know. Species,
nicknames, abilities, items, natures, moves and who is in the party come from
the save. Your KO counts, status marks, graveyard entries and the notes on
them are never touched — the cartridge has no idea which of your Pokémon died
to a critical hit on Route 3.</p>
<p class="muted">One quirk worth knowing: a boxed Pokémon is stored in a
compact form that carries no EV data at all, so a refresh will not overwrite
EVs you typed in for anything currently in the box.</p>

<h2>Randomized runs</h2>
<p>Radical Red does not store abilities in the save — it recomputes them from
your trainer ID. The tracker replays that same calculation, so on an
ability-randomized run the Pokédex shows your run's real abilities rather
than the defaults. The species and learnset randomizers are not recoverable
that way, and the tracker says so instead of showing you numbers that would
be wrong.</p>
<div class="card">
<h3>Nothing to import yet?</h3>
<p>The tracker works by hand too — record each area's encounter as you catch
it and everything downstream still works.</p>
<a class="cta" href="/">Start a run</a>
<a class="cta ghost" href="/routes">Pokémon locations</a>
</div>`,
  });
}
