/** The two data-driven reference pages: where Pokémon are caught, and where
 * items are. Both are the full doc data rather than a sample — a page that
 * makes you open the app to see the rest is worth neither visit. */
import {
  METHOD_LABELS,
  SITE,
  bosses,
  encounters,
  items,
  locationGroups,
  slug,
  types,
  spriteSrc,
  titleCase,
  typesOf,
} from "./data.mjs";
import { esc, shell, typeChip } from "./render.mjs";

/** The locations hub. Every area has its own page now, so this one is the
 * index into them plus the things that belong to no single area — statics,
 * gifts, trades, fossils, the egg vendor. Repeating all 54 encounter tables
 * here would be 54 duplicates of pages that say more. */
export function routesPage() {
  const groups = locationGroups();
  const pageFor = (g) => {
    const entry = ROUTE_PAGES.find((r) => r.area === g.slug);
    return entry ? `/routes/${entry.slug}` : null;
  };

  const card = (g) => {
    const rows = g.sections.flatMap(({ loc }) => Object.values(loc.methods).flat());
    const species = new Set(rows.map((r) => r.species));
    const methods = new Set(
      g.sections.flatMap(({ loc }) => Object.keys(loc.methods)),
    );
    const name =
      ROUTE_PAGES.find((r) => r.area === g.slug)?.name ?? titleCase(g.name);
    // "12-14" is a range: take both ends, or the column reports the highest
    // level you can meet as the highest level any slot STARTS at
    const levels = rows
      .flatMap((r) => String(r.levels).split("-").map((n) => parseInt(n, 10)))
      .filter((n) => !Number.isNaN(n));
    return `<tr>
<td><a href="${pageFor(g)}"><strong>${esc(name)}</strong></a>${
      g.postgame ? ' <span class="muted">postgame</span>' : ""
    }</td>
<td>${species.size}</td>
<td>${levels.length ? `${Math.min(...levels)}–${Math.max(...levels)}` : "—"}</td>
<td class="muted">${[...methods]
      .map((m) => esc(METHOD_LABELS[m] ?? m))
      .join(" · ")}</td></tr>`;
  };

  const table = (list) => `<div class="scroll"><table>
<thead><tr><th>Area</th><th>Pokémon</th><th>Levels</th><th>How you meet them</th></tr></thead>
<tbody>${list.map(card).join("\n")}</tbody></table></div>`;

  const statics = encounters.statics
    .map((x) => `<tr><td><strong>${esc(x.species)}</strong></td><td>${esc(x.info)}</td></tr>`)
    .join("\n");
  const gifts = encounters.gifts
    .map(
      (g) => `<tr><td><strong>${esc(g.species)}</strong></td><td>${esc(
        titleCase(g.location),
      )}</td><td>${esc(g.requirements)} ${esc(g.info ?? "")}</td></tr>`,
    )
    .join("\n");
  const trades = encounters.trades
    .map(
      (t) => `<tr><td>${esc(titleCase(t.location))}</td><td>${esc(t.give)}</td><td>${esc(
        t.receive,
      )}</td></tr>`,
    )
    .join("\n");
  const shardList = (obj) =>
    Object.entries(obj)
      .map(
        ([k, v]) =>
          `<tr><td><strong>${esc(titleCase(k))}</strong></td><td>${v
            .map((x) => esc(x))
            .join(", ")}</td></tr>`,
      )
      .join("\n");

  const totalSpecies = new Set(
    encounters.locations.flatMap((l) =>
      Object.values(l.methods).flat().map((r) => r.species),
    ),
  ).size;

  return shell({
    path: "/routes",
    title: "Radical Red 4.1 Pokémon Locations & Route Encounters",
    description:
      "Every Radical Red 4.1 Pokémon location: route and cave encounters with rates and levels, fishing, surfing, static encounters, gifts, trades and fossils.",
    h1: "Radical Red Pokémon Locations",
    crumbs: [["/routes", "Pokémon locations"]],
    body: `<p class="lede">Where to catch ${totalSpecies} different Pokémon across
${groups.length} areas of Radical Red 4.1. Each area has its own page with the
rate and level range for every slot — day and night grass separately, all three
rods and surfing — plus the items and TMs lying in it, its raid dens and the
trainers waiting there. Below the index are the Pokémon that belong to no
route: statics, gifts, trades and the shard tables.</p>
<p><a class="cta" href="/">Track your encounters as you catch them</a>
<a class="cta ghost" href="/raid-dens">Raid dens</a></p>
<h2>Areas</h2>
${table(groups.filter((g) => !g.postgame))}
<h2>Postgame areas</h2>
${table(groups.filter((g) => g.postgame))}
<h2>Static encounters</h2>
<p class="muted">${encounters.statics.length} one-off Pokémon that stand on the
overworld rather than appearing in a table — legendaries, roamers and gift
sleepers included.</p>
<div class="scroll"><table>
<thead><tr><th>Pokémon</th><th>Where and how</th></tr></thead>
<tbody>${statics}</tbody></table></div>
<h2>Gift Pokémon</h2>
<div class="scroll"><table>
<thead><tr><th>Pokémon</th><th>Where</th><th>Requirement</th></tr></thead>
<tbody>${gifts}</tbody></table></div>
<h2>In-game trades</h2>
<div class="scroll"><table>
<thead><tr><th>Where</th><th>You give</th><th>You get</th></tr></thead>
<tbody>${trades}</tbody></table></div>
<h2>Fossils</h2>
<div class="scroll"><table>
<thead><tr><th>Shard or place</th><th>Revives into</th></tr></thead>
<tbody>${shardList(encounters.fossils)}</tbody></table></div>
<h2>Egg vendor</h2>
<div class="scroll"><table>
<thead><tr><th>Shard</th><th>Possible hatches</th></tr></thead>
<tbody>${shardList(encounters.eggVendor)}</tbody></table></div>
<div class="card">
<h3>Running a Nuzlocke?</h3>
<p>The tracker turns this into your run: one encounter per area, recorded as
you catch it, with the ones you have already used greyed out and your caught
Pokémon carried into the boss matchups.</p>
<a class="cta" href="/">Open the tracker</a>
</div>`,
  });
}

const itemRows = (list, cols) =>
  `<div class="scroll"><table>
<thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
<tbody>${list
    .map((it) => `<tr>${cols.map((c) => `<td>${c[1](it)}</td>`).join("")}</tr>`)
    .join("\n")}</tbody></table></div>`;

/** The items hub. TMs and Mega Stones have their own pages, so this one
 * previews them and keeps what has nowhere else to be — the overworld items,
 * area by area. Two URLs holding the same 120-row table would only split
 * which of them the table belongs to. */
export function itemsPage() {
  const overworld = items.overworld
    .map(
      (a) => `<h3 id="${slug(a.area)}">${esc(titleCase(a.area))}</h3>
${itemRows(a.items, [
  ["Item", (i) => `<strong>${esc(i.name)}</strong>`],
  ["Where", (i) => esc(i.location)],
])}`,
    )
    .join("\n");
  const itemCount = items.overworld.reduce((n, a) => n + a.items.length, 0);

  return shell({
    path: "/items-tms",
    title: "Radical Red 4.1 Item, TM & Mega Stone Locations",
    description:
      "Find Radical Red 4.1 TMs, HMs, held items, Mega Stones, Z-Crystals and overworld item locations by area.",
    h1: "Radical Red Item & TM Locations",
    crumbs: [["/items-tms", "Items & TMs"]],
    body: `<p class="lede">Where to find every item in Radical Red 4.1:
${itemCount} overworld items across ${items.overworld.length} areas below, and
the two sets big enough to need pages of their own — all ${items.tms.length}
TMs, and all ${items.megaStones.length} Mega Stones.</p>
<div class="tags">
<a class="tag" href="/tms">All ${items.tms.length} TMs and ${items.hms.length} HMs →</a>
<a class="tag" href="/mega-stones">All ${items.megaStones.length} Mega Stones and ${items.zCrystals.length} Z-Crystals →</a>
</div>
<p><a class="cta" href="/">Equip them in the damage calculator</a>
<a class="cta ghost" href="/routes">Pokémon locations</a></p>
<h2>Overworld items by area</h2>
${overworld}
<div class="card">
<h3>Held items change the maths</h3>
<p>Every item here is one the tracker's damage calculator knows: give your
Pokémon a Choice Band or a Focus Sash, or read what a boss is holding, and the
damage ranges move with it.</p>
<a class="cta" href="/">Open the calculator</a>
</div>`,
  });
}

export { SITE };


/** Every area gets a page. The docs' own spelling is the slug except where
 * nobody types it that way — "PKMN TOWER", and "SEAFOAM" for what the game
 * calls the Seafoam Islands. `name` is the heading; `area` is the grouped
 * location it comes from when the two differ.
 *
 * These are not thin: each one carries its encounters by section and method,
 * the items and TMs found there, its raid dens, and the trainers the docs
 * put in it. An area with nothing but a grass table would be — none of the
 * 54 are. */
const AREA_OVERRIDES = {
  "pkmn-tower": { slug: "pokemon-tower", name: "Pokémon Tower" },
  seafoam: { slug: "seafoam-islands", name: "Seafoam Islands" },
  "mt-moon": { name: "Mt. Moon" },
  "s-s-anne": { name: "S.S. Anne" },
  "gouging-s-room": { name: "Gouging's Room" },
};

export const ROUTE_PAGES = locationGroups().map((g) => {
  const o = AREA_OVERRIDES[g.slug] ?? {};
  return { slug: o.slug ?? g.slug, area: g.slug, name: o.name };
});

const norm = (s) =>
  String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PKMN/, "POKEMON");

/** the same area under two spellings — "MT MOON" and "Mt. Moon", "SEAFOAM"
 * and "Seafoam Islands". Prefix matching, but never across a number
 * boundary, or Route 1 would swallow Routes 10 through 19. */
function sameArea(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && !/\d/.test(long[short.length]);
}

export function routePage(entry) {
  const groups = locationGroups();
  const i = groups.findIndex((g) => g.slug === (entry.area ?? entry.slug));
  const g = groups[i];
  if (!g) throw new Error(`seo: no location group for ${entry.slug}`);
  const name = entry.name ?? titleCase(g.name);

  const encounterHtml = g.sections
    .map(({ label, loc }) => {
      const inner = Object.entries(loc.methods)
        .map(([method, rows]) => {
          const body = rows
            .map(
              (r) => `<tr><td>${esc(r.species)} ${typesOf(r.species)
                .map(typeChip)
                .join("")}</td><td>${esc(r.rarity ?? "")}</td><td>${esc(r.levels ?? "")}</td></tr>`,
            )
            .join("\n");
          return `<h4>${esc(METHOD_LABELS[method] ?? method)}</h4>
<div class="scroll"><table>
<thead><tr><th>Pokémon</th><th>Rate</th><th>Levels</th></tr></thead>
<tbody>${body}</tbody></table></div>`;
        })
        .join("\n");
      return `${label ? `<h3>${esc(titleCase(label))}</h3>` : ""}${
        inner || '<p class="muted">No wild encounters documented here.</p>'
      }`;
    })
    .join("\n");

  const areaItems = items.overworld.filter((a) => sameArea(a.area, g.name));
  const itemHtml = areaItems.length
    ? areaItems
        .map(
          (a) => `${areaItems.length > 1 ? `<h3>${esc(a.area)}</h3>` : ""}
<div class="scroll"><table>
<thead><tr><th>Item</th><th>Where</th></tr></thead>
<tbody>${a.items
            .map((it) => `<tr><td><strong>${esc(it.name)}</strong></td><td>${esc(it.location)}</td></tr>`)
            .join("\n")}</tbody></table></div>`,
        )
        .join("\n")
    : "";

  const tms = items.tms.filter((t) => sameArea(t.location.split(",")[0], g.name));
  const tmHtml = tms.length
    ? `<div class="scroll"><table>
<thead><tr><th>TM</th><th>Move</th><th>Where</th></tr></thead>
<tbody>${tms
        .map(
          (t) => `<tr><td><strong>TM${esc(t.num)}</strong></td><td>${esc(t.move)}</td><td>${esc(
            t.location,
          )}</td></tr>`,
        )
        .join("\n")}</tbody></table></div>`
    : "";

  const dens = encounters.raids.locations.filter((r) => sameArea(r.location, g.name));
  const denHtml = dens.length
    ? dens
        .map(
          (d) => `<h3>${esc(d.location)} <span class="muted">${"★".repeat(d.stars)}</span></h3>
<div class="tags">${d.dens
            .map((den) => {
              const src = spriteSrc(den.species);
              return `<span class="tag">${
                src ? `<img src="${src}" alt="" width="24" height="24" loading="lazy">` : ""
              }${esc(den.species)}</span>`;
            })
            .join("")}</div>`,
        )
        .join("\n")
    : "";

  // trainers the docs track here, in the order you meet them. Both modes,
  // because the hardcore order adds fights the normal one doesn't have.
  const trainerHtml = ["default", "hardcore"]
    .map((mode) => {
      const rows = bosses[mode].trainerOrder
        .map((t, idx) => ({ t, idx }))
        .filter(({ t }) => sameArea(t.location ?? "", g.name));
      if (!rows.length) return "";
      return `<h3>${mode === "default" ? "Normal" : "Hardcore"} mode</h3>
<div class="scroll"><table>
<thead><tr><th>#</th><th>Trainer</th><th>Level cap</th><th></th></tr></thead>
<tbody>${rows
        .map(
          ({ t, idx }) => `<tr><td>${idx + 1}</td><td><strong>${esc(titleCase(t.name))}</strong>${
            t.optional ? ' <span class="muted">optional</span>' : ""
          }</td><td>${esc(t.levelCap || "—")}</td><td>${
            t.rewards?.length
              ? esc(t.rewards.map((r) => r.label).join(", "))
              : ""
          }</td></tr>`,
        )
        .join("\n")}</tbody></table></div>`;
    })
    .filter(Boolean)
    .join("\n");

  const near = [groups[i - 1], groups[i + 1]].filter(Boolean);
  const speciesCount = new Set(
    g.sections.flatMap(({ loc }) => Object.values(loc.methods).flat().map((r) => r.species)),
  ).size;

  return shell({
    path: `/routes/${entry.slug}`,
    title: `Radical Red 4.1 ${name} Encounters, Items & Trainers`,
    description: `${name} in Radical Red 4.1: every wild encounter with rates and levels, the items and TMs found there, the trainers you meet and what your level cap is.`,
    h1: `${name} — Radical Red 4.1`,
    crumbs: [
      ["/routes", "Pokémon locations"],
      [`/routes/${entry.slug}`, name],
    ],
    body: `<p class="lede">Everything documented at ${name} in Radical Red 4.1 —
${speciesCount} catchable Pokémon across ${g.sections.length} ${
      g.sections.length === 1 ? "area" : "sections"
    }, with the rate and level range for each slot${
      areaItems.length || tms.length ? ", the items lying around" : ""
    }${trainerHtml ? ", and the trainers waiting in it" : ""}.</p>
<p><a class="cta" href="/">Record your encounter here</a>
<a class="cta ghost" href="/routes">All locations</a></p>
<h2>Wild encounters</h2>
${encounterHtml}
${itemHtml ? `<h2>Items</h2>${itemHtml}` : ""}
${tmHtml ? `<h2>TMs found here</h2>${tmHtml}` : ""}
${denHtml ? `<h2>Raid dens</h2>${denHtml}` : ""}
${trainerHtml ? `<h2>Trainers here</h2>${trainerHtml}` : ""}
${
  near.length
    ? `<h2>Nearby</h2><div class="tags">${near
        .map(
          (n) =>
            `<a class="tag" href="${
              ROUTE_PAGES.some((r) => (r.area ?? r.slug) === n.slug)
                ? `/routes/${ROUTE_PAGES.find((r) => (r.area ?? r.slug) === n.slug).slug}`
                : `/routes#${n.id}`
            }">${esc(titleCase(n.name))}</a>`,
        )
        .join("")}</div>`
    : ""
}
<div class="card">
<h3>One encounter, one area</h3>
<p>In a Nuzlocke ${name} is a single slot. The tracker keeps that rule for
you — record what you caught here, and it carries into your party, your boss
matchups and the damage calculator.</p>
<a class="cta" href="/">Open the tracker</a>
</div>`,
  });
}

/** TMs get their own page because "radical red tm locations" is its own
 * search, and a table of 120 rows is a page rather than a section. The
 * items hub keeps the ones with nowhere else to be. */
export function tmsPage() {
  return shell({
    path: "/tms",
    title: "Radical Red 4.1 TM Locations — All 120 TMs",
    description:
      "Every Radical Red 4.1 TM: the move it teaches and exactly where to find it, plus the eight HMs.",
    h1: "Radical Red TM Locations",
    crumbs: [["/tms", "TM locations"]],
    body: `<p class="lede">All ${items.tms.length} TMs in Radical Red 4.1 with the
move each one teaches and where it is, and the ${items.hms.length} HMs after
them. TMs are reusable in Radical Red, so a TM you find is a move the rest of
your run can keep learning.</p>
<p><a class="cta" href="/">Check who can learn what</a>
<a class="cta ghost" href="/items-tms">Other items</a></p>
<h2>TMs</h2>
${itemRows(items.tms, [
  ["TM", (t) => `<strong>TM${esc(t.num)}</strong>`],
  ["Move", (t) => esc(t.move)],
  [
    "Where",
    (t) =>
      esc(t.location) +
      (t.notes?.length ? ` <span class="muted">${esc(t.notes.join(" "))}</span>` : ""),
  ],
])}
<h2>HMs</h2>
${itemRows(items.hms, [
  ["HM", (t) => `<strong>HM${esc(t.num)}</strong>`],
  ["Move", (t) => esc(t.move)],
  ["Where", (t) => esc(t.location)],
])}
<div class="card">
<h3>Which of your Pokémon can learn it?</h3>
<p>The tracker's Pokédex answers the other half: type a move and it lists
every Pokémon that can learn it, tagged with how — by level, by TM number, by
tutor or as an egg move.</p>
<a class="cta" href="/">Open the Pokédex</a>
</div>`,
  });
}

export function megaStonesPage() {
  return shell({
    path: "/mega-stones",
    title: "Radical Red 4.1 Mega Stone Locations — All 62",
    description:
      "Every Mega Stone in Radical Red 4.1 and how to get it, plus the Z-Crystals and where they come from.",
    h1: "Radical Red Mega Stone Locations",
    crumbs: [["/mega-stones", "Mega Stones"]],
    body: `<p class="lede">All ${items.megaStones.length} Mega Stones in Radical
Red 4.1 and where each one comes from — most are earned by showing the right
Pokémon to the right trainer rather than found lying on the floor — and the
${items.zCrystals.length} Z-Crystals after them.</p>
<p><a class="cta" href="/">Put one on your team</a>
<a class="cta ghost" href="/bosses">Who the bosses mega-evolve</a></p>
<h2>Mega Stones</h2>
${itemRows(items.megaStones, [
  ["Stone", (t) => `<strong>${esc(t.name)}</strong>`],
  ["How to get it", (t) => esc(t.location)],
])}
<h2>Z-Crystals</h2>
${itemRows(items.zCrystals, [
  ["Z-Crystal", (t) => `<strong>${esc(t.name)}</strong>`],
  ["How to get it", (t) => esc(t.location)],
])}
<div class="card">
<h3>Bosses mega-evolve too</h3>
<p>Several documented boss teams carry a Mega Stone of their own — the
calculator applies it, so the damage you read is the damage the mega does.</p>
<a class="cta ghost" href="/elite-four">Elite Four teams</a>
<a class="cta ghost" href="/bosses">Every boss</a>
</div>`,
  });
}

export function raidDensPage() {
  const dens = encounters.raids.locations;
  const blocks = dens
    .map(
      (d) => `<h3>${esc(d.location)} <span class="muted">${"★".repeat(d.stars)}</span></h3>
<div class="scroll"><table>
<thead><tr><th>Pokémon</th><th>Drops</th></tr></thead>
<tbody>${d.dens
        .map((den) => {
          const src = spriteSrc(den.species);
          return `<tr><td>${
            src
              ? `<img src="${src}" alt="" width="32" height="32" loading="lazy" decoding="async"> `
              : ""
          }<strong>${esc(den.species)}</strong> ${typesOf(den.species).map(typeChip).join("")}</td>
<td>${(den.drops ?? [])
            .map((x) => `${esc(x.item)} <span class="muted">${esc(x.rarity)}</span>`)
            .join(" · ")}</td></tr>`;
        })
        .join("\n")}</tbody></table></div>`,
    )
    .join("\n");
  return shell({
    path: "/raid-dens",
    title: "Radical Red 4.1 Raid Dens — Pokémon & Drops by Location",
    description:
      "Every Radical Red 4.1 raid den: which Pokémon it can hold, what they drop, and how the star rating follows your badge count.",
    h1: "Radical Red Raid Dens",
    crumbs: [["/raid-dens", "Raid dens"]],
    body: `<p class="lede">All ${dens.length} documented raid dens in Radical Red
4.1, the Pokémon each can hold and the items they drop. How hard a den is
depends on how many badges you have, so the same den is a different fight
early and late.</p>
<div class="card">
<h3>How the stars work</h3>
${encounters.raids.info
  .map((line) => `<p class="muted">${esc(line.replace(/^-\s*/, ""))}</p>`)
  .join("")}
</div>
<p><a class="cta" href="/">Track what you catch</a>
<a class="cta ghost" href="/routes">All Pokémon locations</a></p>
${blocks}`,
  });
}

/** How every Pokémon evolves in this ROM hack.
 *
 * Deliberately NOT titled "evolution changes": the tracker has Radical Red's
 * evolution data but not the base game's, so it can state how a Pokémon
 * evolves here and cannot honestly claim which of those are changes. */
export function evolutionsPage() {
  const evolutions = types.evolutions;
  const names = Object.keys(evolutions).sort((a, b) => a.localeCompare(b));
  const rows = names
    .map((from) => {
      // the docs sometimes list the same edge twice
      const seen = new Set();
      const edges = evolutions[from].filter((e) => {
        const k = `${e.to}|${e.how}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const src = spriteSrc(from);
      return `<tr><td>${
        src ? `<img src="${src}" alt="" width="32" height="32" loading="lazy" decoding="async"> ` : ""
      }<strong>${esc(from)}</strong></td>
<td>${edges.map((e) => `${esc(e.to)} <span class="muted">${esc(e.how)}</span>`).join("<br>")}</td></tr>`;
    })
    .join("\n");
  return shell({
    path: "/evolutions",
    title: "Radical Red 4.1 Evolution Methods — Every Pokémon",
    description:
      "How every Pokémon evolves in Radical Red 4.1: levels, stones, trades, friendship and the hack's own conditions, for all evolving species.",
    h1: "Radical Red Evolution Methods",
    crumbs: [["/evolutions", "Evolution methods"]],
    body: `<p class="lede">How each of the ${names.length} evolving Pokémon in
Radical Red 4.1 gets there — the level, stone, item, trade or condition the
hack actually uses. Radical Red rewrites a lot of these, so an evolution that
needed a trade in the base games often does not here.</p>
<p class="lede muted">This is Radical Red's own evolution data. It says how a
Pokémon evolves in this hack; it does not claim which of those differ from
the base games, because the tracker has no base-game data to compare
against.</p>
<p><a class="cta" href="/">Evolve them in your run</a>
<a class="cta ghost" href="/routes">Where to catch them</a></p>
<div class="scroll"><table>
<thead><tr><th>Pokémon</th><th>Evolves into</th></tr></thead>
<tbody>${rows}</tbody></table></div>`,
  });
}
