/** Generates the static reference pages into dist/, after `vite build`.
 *
 * Runs last in `npm run build` so it can drop files beside the app's own
 * output. Nothing here touches the SPA: these are separate URLs the app
 * links out to and that link back into it. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MODES,
  SECTIONS,
  SITE,
  bosses,
  expandMove,
  groupByPerson,
  personOf,
  placeOf,
  slug,
  spriteSrc,
  teamProfile,
  titleCase,
  typesOf,
  withOrder,
} from "./data.mjs";
import { esc, modeToggle, shell, typeChip } from "./render.mjs";

const dist = fileURLToPath(new URL("../../dist/", import.meta.url));

/** persons with their own page. The generator can produce one for any name
 * in the boss data — this list is what's published, and it grows as pages
 * earn impressions rather than all at once. */
const BOSS_PAGES = ["giovanni", "sabrina"];

const written = [];

function write(path, html) {
  // a page whose section isn't on the shared list would be published, linked
  // and sitemapped while the service worker still answered it with the app
  // shell — so fail the build instead, here, where the fix is obvious
  const section = path.split("/")[1];
  const known = SECTIONS.find((s) => s.slug === section);
  if (!known) {
    throw new Error(
      `seo: ${path} is not in src/lib/seoSections.json — add the section there first`,
    );
  }
  if (!known.published) {
    throw new Error(`seo: ${path} is generated but "${section}" is published: false`);
  }
  // flat files: /bosses/sabrina.html serves at /bosses/sabrina, which is the
  // URL we publish and canonicalise. A directory + index.html would only be
  // reachable at the trailing-slash form.
  const file = dist + path.replace(/^\//, "") + ".html";
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  writeFileSync(file, html);
  written.push(path);
}

/** deep link into the app. `to` picks where it lands: the boss's team, the
 * Battle Readiness matchup, or the damage calculator seeded with that team. */
function appLink(category, title, to) {
  const q = `cat=${slug(category)}&boss=${slug(title)}`;
  return `/?${q}${to ? `&to=${to}` : ""}`;
}

const capOf = (order) => (order?.levelCap ? order.levelCap : "—");

// ---------------------------------------------------------------- fragments

function monCard(mon) {
  const src = spriteSrc(mon.species);
  const stats = Object.entries(mon.baseStats ?? {})
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  const evs = Object.entries(mon.evs ?? {})
    .map(([k, v]) => `${v} ${k}`)
    .join(" / ");
  const row = (label, value) =>
    value ? `<dt>${label}</dt><dd>${esc(value)}</dd>` : "";
  return `<div class="mon">
<div class="top">
${src ? `<img src="${src}" alt="${esc(mon.species)}" width="56" height="56" loading="lazy" decoding="async">` : ""}
<div><div class="name">${esc(mon.species)}</div>
<div class="muted">Lv ${esc(mon.level)}</div>
<div>${typesOf(mon.species).map(typeChip).join("")}</div></div>
</div>
<dl>
${row("Ability", mon.ability)}
${row("Item", mon.item)}
${row("Nature", mon.nature)}
${row("Speed", mon.speedStat)}
${row("EVs", evs)}
${row("Base", stats)}
</dl>
${
  mon.moves?.length
    ? `<ul class="moves">${mon.moves
        .map((m) => `<li>${esc(expandMove(m))}</li>`)
        .join("")}</ul>`
    : ""
}
</div>`;
}

function teamAnalysis(team) {
  const { weak, immune } = teamProfile(team);
  const fastest = team.reduce(
    (a, b) => (Number(b.speedStat ?? 0) > Number(a.speedStat ?? 0) ? b : a),
    team[0],
  );
  const tags = (list, word) =>
    list.length
      ? `<div class="tags">${list
          .map(([t, n]) => `<span class="tag">${esc(t)} <b>${n}</b> ${word}</span>`)
          .join("")}</div>`
      : `<p class="muted">None.</p>`;
  return `<h3>Team analysis</h3>
<p class="muted">How many of the six a type hits for super-effective damage,
counting each Pokémon's own ability (Levitate, Thick Fat and the rest).</p>
${tags(weak, "weak")}
<p class="muted">Immunities on this team:</p>
${tags(immune, "immune")}
${
  fastest
    ? `<p>Fastest: <strong>${esc(fastest.species)}</strong> at ${esc(
        fastest.speedStat ?? "?",
      )} Speed — anything slower than that moves second.</p>`
    : ""
}`;
}

/** one fight: its conditions, its six Pokémon, the analysis and the CTAs.
 * `level` is 2 normally and 3 on the Elite Four page, where each member
 * already owns the h2 and their variant teams sit under it. */
function fightSection(f, person, mode, level = 2) {
  const b = f.boss;
  // the trainer-order row spells the place out in full; the title abbreviates
  // it to fit the docs' own column ("CERULEA. CAVE")
  const place = titleCase(f.order?.location ?? placeOf(b.title));
  const name = titleCase(person);
  const heading = [
    level === 2 ? name : null,
    place,
    b.subtitle && `(${titleCase(b.subtitle)})`,
  ]
    .filter(Boolean)
    .join(" — ")
    .replace(" — (", " (");
  const h = `h${level}`;
  const meta = [
    ["Location", place],
    ["Level cap", capOf(f.order)],
    ["Battle", b.battleEffect ? titleCase(b.battleEffect) : "Single battle"],
    ["Notes", b.notes],
  ].filter(([, v]) => v);
  return `<${h} id="${mode}-${slug(b.title + " " + (b.subtitle ?? ""))}">${esc(
    heading,
  )}</${h}>
<div class="card">
<table><tbody>
${meta
  .map(
    ([k, v]) =>
      `<tr><th>${esc(k)}</th><td${
        k === "Battle" && b.battleEffect ? ' class="effect"' : ""
      }>${esc(v)}</td></tr>`,
  )
  .join("\n")}
</tbody></table>
</div>
<div class="mons">${b.pokemon.map(monCard).join("\n")}</div>
${teamAnalysis(b.pokemon)}
<div class="card">
<h3>Check your own team against ${esc(name)}</h3>
<p>Battle Readiness runs every Pokémon in your party against all six of
${esc(name)}'s, both ways, and tells you which of yours survive and which of
theirs you can take down — instead of one matchup at a time.</p>
<a class="cta" href="${appLink(f.category, b.title, "readiness")}">Analyze my team vs ${esc(
    name,
  )}</a>
<a class="cta ghost" href="${appLink(f.category, b.title, "calc")}">Open in the damage calculator</a>
<a class="cta ghost" href="${appLink(f.category, b.title)}">View this team in the tracker</a>
</div>`;
}

// -------------------------------------------------------------------- pages

function levelCapsPage() {
  const panels = MODES.map(({ id, label }) => {
    const data = bosses[id];
    const leaders = data.categories
      .find((c) => c.name === "Kanto Leaders")
      .bosses.map((b) => {
        const name = personOf(b.title);
        const row = data.trainerOrder.find(
          (t) => t.name.toUpperCase() === name.toUpperCase(),
        );
        return { name, row, title: b.title };
      });
    const rows = leaders
      .map(({ name, row, title }) => {
        const page = BOSS_PAGES.includes(slug(name)) ? `/bosses/${slug(name)}` : null;
        return `<tr>
<td><strong>${page ? `<a href="${page}">${esc(titleCase(name))}</a>` : esc(titleCase(name))}</strong></td>
<td>${esc(titleCase(row?.location ?? "—"))}</td>
<td><strong>${esc(row?.levelCap ?? "—")}</strong></td>
<td><a href="${appLink("Kanto Leaders", title)}">Open in tracker</a></td></tr>`;
      })
      .join("\n");
    const all = data.trainerOrder
      .map(
        (t, i) => `<tr><td>${i + 1}</td><td>${esc(titleCase(t.name))}</td>
<td>${esc(titleCase(t.location ?? ""))}</td><td>${esc(t.levelCap || "—")}</td>
<td>${t.optional ? "optional" : ""}</td></tr>`,
      )
      .join("\n");
    return {
      mode: id,
      label,
      html: `<h2>${esc(label)} mode — gym leader checkpoints</h2>
<div class="scroll"><table>
<thead><tr><th>Gym leader</th><th>Location</th><th>Level cap</th><th></th></tr></thead>
<tbody>${rows}</tbody></table></div>
<h3>Every tracked fight in order (${data.trainerOrder.length})</h3>
<p class="muted">The cap column is what the docs list against that fight —
the number you are expected to be at or under when you take it, not the
number beating it grants you.</p>
<div class="scroll"><table>
<thead><tr><th>#</th><th>Trainer</th><th>Location</th><th>Cap</th><th></th></tr></thead>
<tbody>${all}</tbody></table></div>`,
    };
  });
  return shell({
    path: "/level-caps",
    title: "Radical Red 4.1 Level Caps — Normal & Hardcore",
    description:
      "Radical Red 4.1 level caps for Normal and Hardcore mode. See every major boss checkpoint and know exactly when your next level cap changes.",
    h1: "Radical Red 4.1 Level Caps",
    crumbs: [["/level-caps", "Level caps"]],
    body: `<p class="lede">Every level cap in Radical Red 4.1, in the order you meet
it. A cap is the level you have to stay at or under for that fight; it goes up
when you take the badge, not when you beat any trainer inside the stretch —
which is why a whole run of fights between two gyms all list the same number.</p>
<p class="lede">Some Hardcore rows are written <code>28/36</code> or <code>16+</code>
exactly as the official docs write them. The tracker reads the leading number.</p>
<p><a class="cta" href="/">Track your run and the cap follows you</a></p>
${modeToggle("caps", panels)}`,
  });
}

function bossesPage() {
  const panels = MODES.map(({ id, label }) => {
    const groups = groupByPerson(id);
    const sections = bosses[id].categories
      .map((cat) => {
        const rows = cat.bosses
          .map((b) => {
            const person = personOf(b.title);
            const g = withOrder(id, groups.get(slug(person)));
            const f = g.find((x) => x.boss === b);
            const page = BOSS_PAGES.includes(slug(person))
              ? `/bosses/${slug(person)}`
              : null;
            const label = titleCase(
              [placeOf(b.title), b.subtitle].filter(Boolean).join(" · "),
            );
            return `<tr>
<td><strong>${esc(titleCase(person))}</strong>${
              label ? `<br><span class="muted">${esc(label)}</span>` : ""
            }</td>
<td>${esc(titleCase(f?.order?.location ?? placeOf(b.title)))}</td>
<td>${esc(capOf(f?.order))}</td>
<td>${esc(titleCase(b.battleEffect))}</td>
<td>${
              page
                ? `<a href="${page}">Full page</a> · `
                : ""
            }<a href="${appLink(cat.name, b.title)}">View team</a></td></tr>`;
          })
          .join("\n");
        return `<h3>${esc(cat.name)} <span class="muted">(${cat.bosses.length})</span></h3>
<div class="scroll"><table>
<thead><tr><th>Boss</th><th>Location</th><th>Cap</th><th>Battle</th><th></th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
      })
      .join("\n");
    return { mode: id, label, html: `<h2>${esc(label)} mode</h2>${sections}` };
  });
  return shell({
    path: "/bosses",
    title: "Radical Red 4.1 Boss Teams & Trainer Order",
    description:
      "Browse Radical Red 4.1 boss teams in battle order with Pokémon, levels, moves, abilities, held items, battle effects and level caps.",
    h1: "Radical Red Boss Teams",
    crumbs: [["/bosses", "Boss teams"]],
    body: `<p class="lede">Every documented boss in Radical Red 4.1 — gym leaders,
rivals, Team Rocket, mini bosses, the Indigo League and the postgame — in the
order you meet them, with the level cap that applies and the battle conditions
they bring. Open any of them to see the full team, or load it straight into the
tracker against your own party.</p>
<p><a class="cta" href="/">Open the tracker</a>
<a class="cta ghost" href="/level-caps">Level caps</a>
<a class="cta ghost" href="/elite-four">Elite Four</a></p>
${modeToggle("bl", panels)}`,
  });
}

/** prev/next among the fights either side of this one in the trainer order,
 * linked to their row on /bosses (which always exists) */
function relatedBosses(mode, orderIndex) {
  if (orderIndex == null) return "";
  const order = bosses[mode].trainerOrder;
  const near = [order[orderIndex - 1], order[orderIndex + 1]].filter(Boolean);
  if (!near.length) return "";
  return `<h2>Around this fight</h2>
<p>${near
    .map(
      (t, i) =>
        `${i === 0 ? "Before" : "After"}: <strong>${esc(titleCase(t.name))}</strong> at ${esc(
          titleCase(t.location ?? ""),
        )} (cap ${esc(t.levelCap || "—")})`,
    )
    .join("<br>")}</p>
<p><a class="cta ghost" href="/bosses">View all boss teams</a>
<a class="cta ghost" href="/level-caps">Level caps</a></p>`;
}

const PAGE_COPY = {
  giovanni: {
    title: "Radical Red Giovanni Teams — Rocket Hideout, Silph & Cerulean Cave",
    description:
      "See every Giovanni battle in Radical Red 4.1, including Rocket Hideout, Silph Co. and Cerulean Cave teams, moves, items and matchup tools.",
    h1: "Giovanni Teams in Radical Red 4.1",
    lede: `Giovanni is fought three times in Radical Red 4.1 and brings a different
team each time. Every fight below is the documented 4.1 team — levels, abilities,
held items, natures and moves — for both Normal and Hardcore mode.`,
  },
  sabrina: {
    title: "Radical Red Sabrina Team, Moves & Matchups — 4.1",
    description:
      "Prepare for Sabrina in Radical Red 4.1 with her full team, moves, abilities, held items, battle effects and damage-calculator matchups.",
    h1: "Sabrina Boss Fight — Radical Red 4.1",
    lede: `Sabrina's Saffron City gym is a double battle in Radical Red 4.1, and in
Hardcore mode it runs under permanent Trick Room. Her full team for both modes is
below, with the level cap in force and every move, ability and held item.`,
  },
};

function bossPage(personSlug) {
  const copy = PAGE_COPY[personSlug];
  const panels = MODES.map(({ id, label }) => {
    const group = groupByPerson(id).get(personSlug);
    if (!group) return { mode: id, label, html: `<p class="muted">Not in this mode.</p>` };
    const fights = withOrder(id, group);
    return {
      mode: id,
      label,
      html:
        fights.map((f) => fightSection(f, group.person, id)).join("\n") +
        relatedBosses(id, fights[fights.length - 1]?.orderIndex),
    };
  });
  const person = titleCase(groupByPerson("default").get(personSlug)?.person ?? personSlug);
  return shell({
    path: `/bosses/${personSlug}`,
    title: copy.title,
    description: copy.description,
    h1: copy.h1,
    crumbs: [
      ["/bosses", "Boss teams"],
      [`/bosses/${personSlug}`, person],
    ],
    body: `<p class="lede">${copy.lede}</p>${modeToggle(personSlug, panels)}`,
  });
}

function eliteFourPage() {
  const panels = MODES.map(({ id, label }) => {
    const cat = bosses[id].categories.find((c) => c.name === "Indigo League");
    const groups = groupByPerson(id);
    const seen = new Set();
    const html = cat.bosses
      .map((b) => {
        const person = personOf(b.title);
        const fights = withOrder(id, groups.get(slug(person)));
        const f = fights.find((x) => x.boss === b);
        // one h2 per member, their alternate teams as h3s under it
        const head = seen.has(person)
          ? ""
          : `<h2 id="${id}-${slug(person)}">${esc(titleCase(person))}</h2>`;
        seen.add(person);
        return head + fightSection(f, person, id, 3);
      })
      .join("\n");
    return { mode: id, label, html };
  });
  return shell({
    path: "/elite-four",
    title: "Radical Red 4.1 Elite Four Teams & Champion",
    description:
      "Radical Red 4.1 Elite Four and Champion teams with alternate lineups, moves, held items, abilities, levels and battle preparation tools.",
    h1: "Radical Red Elite Four & Champion",
    crumbs: [["/elite-four", "Elite Four"]],
    body: `<p class="lede">Lorelei, Bruno, Agatha, Lance and the Champion, with every
alternate lineup the game can bring — Lorelei's rain and snow teams, and the
second team each of the others can field. All of it is the documented Radical Red
4.1 data, for Normal and Hardcore mode, including the permanent weather and
terrain each fight sets.</p>
<p><a class="cta" href="/">Check your team against them</a>
<a class="cta ghost" href="/bosses">All boss teams</a></p>
${modeToggle("e4", panels)}`,
  });
}

function sitemap() {
  const urls = ["/", ...written];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- generated by scripts/seo/build.mjs; do not edit -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${SITE}${u}</loc><changefreq>weekly</changefreq><priority>${
        u === "/" ? "1.0" : "0.8"
      }</priority></url>`,
  )
  .join("\n")}
</urlset>`;
}

// ---------------------------------------------------------------------- run

write("/level-caps", levelCapsPage());
write("/bosses", bossesPage());
for (const p of BOSS_PAGES) write(`/bosses/${p}`, bossPage(p));
write("/elite-four", eliteFourPage());
writeFileSync(dist + "sitemap.xml", sitemap());
console.log(`seo: ${written.length} pages + sitemap.xml`);
