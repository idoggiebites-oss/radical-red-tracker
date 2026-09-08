/** The two data-driven reference pages: where Pokémon are caught, and where
 * items are. Both are the full doc data rather than a sample — a page that
 * makes you open the app to see the rest is worth neither visit. */
import {
  METHOD_LABELS,
  SITE,
  encounters,
  items,
  slug,
  titleCase,
  typesOf,
} from "./data.mjs";
import { esc, shell, typeChip } from "./render.mjs";

/** encounter tables carry ~1600 rows across 83 areas; sprites are left off
 * on purpose here (they are on the boss pages, where six Pokémon are the
 * subject rather than a list you scan) */
function locationBlock(loc) {
  const tables = Object.entries(loc.methods)
    .map(([method, rows]) => {
      const body = rows
        .map(
          (r) => `<tr><td>${esc(r.species)} ${typesOf(r.species)
            .map(typeChip)
            .join("")}</td><td>${esc(r.rarity ?? "")}</td><td>${esc(
            r.levels ?? "",
          )}</td></tr>`,
        )
        .join("\n");
      return `<h4>${esc(METHOD_LABELS[method] ?? method)}</h4>
<div class="scroll"><table>
<thead><tr><th>Pokémon</th><th>Rate</th><th>Levels</th></tr></thead>
<tbody>${body}</tbody></table></div>`;
    })
    .join("\n");
  return `<h3 id="${loc.id}">${esc(titleCase(loc.name))}${
    loc.postgame ? ' <span class="tag">postgame</span>' : ""
  }</h3>
${tables || '<p class="muted">No wild encounters documented here.</p>'}`;
}

export function routesPage() {
  const locs = encounters.locations;
  const main = locs.filter((l) => !l.postgame);
  const post = locs.filter((l) => l.postgame);
  const index = (list) =>
    `<div class="tags">${list
      .map((l) => `<a class="tag" href="#${l.id}">${esc(titleCase(l.name))}</a>`)
      .join("")}</div>`;

  const statics = encounters.statics
    .map((s) => `<tr><td><strong>${esc(s.species)}</strong></td><td>${esc(s.info)}</td></tr>`)
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
            .map((s) => esc(s))
            .join(", ")}</td></tr>`,
      )
      .join("\n");

  return shell({
    path: "/routes",
    title: "Radical Red 4.1 Pokémon Locations & Route Encounters",
    description:
      "Every Radical Red 4.1 Pokémon location: route and cave encounters with rates and levels, fishing, surfing, static encounters, gifts, trades and fossils.",
    h1: "Radical Red Pokémon Locations",
    crumbs: [["/routes", "Pokémon locations"]],
    jsonLd: [],
    body: `<p class="lede">Every documented encounter in Radical Red 4.1 — ${
      locs.length
    } areas, with the rate and level range for each slot, split by how you meet
it: grass and caves by day and night, the three rods, and surfing. Below the
areas are the static encounters, gift Pokémon, in-game trades and the fossil
and egg shards.</p>
<p class="lede">Day and night matter here: most areas have a different grass
table after dark, and both are listed.</p>
<p><a class="cta" href="/">Track your encounters as you catch them</a>
<a class="cta ghost" href="/bosses">Boss teams</a></p>
<h2>Areas</h2>
${index(main)}
${main.map(locationBlock).join("\n")}
<h2>Postgame areas</h2>
${index(post)}
${post.map(locationBlock).join("\n")}
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
<p>The tracker takes this same table and turns it into your run: one
encounter per area, recorded as you catch it, with the ones you have already
used greyed out and your caught Pokémon carried into the boss matchups.</p>
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

export function itemsPage() {
  const tms = itemRows(items.tms, [
    ["TM", (t) => `<strong>TM${esc(t.num)}</strong>`],
    ["Move", (t) => esc(t.move)],
    ["Where", (t) => esc(t.location) + (t.notes?.length ? ` <span class="muted">${esc(t.notes.join(" "))}</span>` : "")],
  ]);
  const hms = itemRows(items.hms, [
    ["HM", (t) => `<strong>HM${esc(t.num)}</strong>`],
    ["Move", (t) => esc(t.move)],
    ["Where", (t) => esc(t.location)],
  ]);
  const stones = itemRows(items.megaStones, [
    ["Mega Stone", (t) => `<strong>${esc(t.name)}</strong>`],
    ["Where", (t) => esc(t.location)],
  ]);
  const zs = itemRows(items.zCrystals, [
    ["Z-Crystal", (t) => `<strong>${esc(t.name)}</strong>`],
    ["Where", (t) => esc(t.location)],
  ]);
  const overworld = items.overworld
    .map(
      (a) => `<h3 id="${slug(a.area)}">${esc(titleCase(a.area))}</h3>
${itemRows(a.items, [
  ["Item", (i) => `<strong>${esc(i.name)}</strong>`],
  ["Where", (i) => esc(i.location)],
])}`,
    )
    .join("\n");

  return shell({
    path: "/items-tms",
    title: "Radical Red 4.1 Item, TM & Mega Stone Locations",
    description:
      "Find Radical Red 4.1 TMs, HMs, held items, Mega Stones, Z-Crystals and overworld item locations by area.",
    h1: "Radical Red Item & TM Locations",
    crumbs: [["/items-tms", "Items & TMs"]],
    body: `<p class="lede">Where to find every item in Radical Red 4.1: all
${items.tms.length} TMs and ${items.hms.length} HMs with the move each one
teaches, ${items.megaStones.length} Mega Stones, ${items.zCrystals.length}
Z-Crystals, and the overworld items area by area.</p>
<p><a class="cta" href="/">Equip them in the damage calculator</a>
<a class="cta ghost" href="/bosses">Boss teams</a></p>
<h2>TMs</h2>${tms}
<h2>HMs</h2>${hms}
<h2>Mega Stones</h2>${stones}
<h2>Z-Crystals</h2>${zs}
<h2>Overworld items by area</h2>
<p class="muted">${items.overworld.length} areas.</p>
${overworld}
<div class="card">
<h3>Held items change the maths</h3>
<p>Every item here is one the tracker's damage calculator knows: give your
Pokémon a Choice Band or a Focus Sash, or read what a boss is holding, and
the damage ranges move with it.</p>
<a class="cta" href="/">Open the calculator</a>
</div>`,
  });
}

export { SITE };
