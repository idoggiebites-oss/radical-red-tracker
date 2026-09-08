/** Generates the static reference pages into dist/, after `vite build`.
 *
 * Runs last in `npm run build` so it can drop files beside the app's own
 * output. Nothing here touches the SPA: these are separate URLs the app
 * links out to and that link back into it. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BOSS_PAGES,
  MODES,
  PUBLISHED,
  ROUTE_PAGES,
  routePathFor,
  SECTIONS,
  SITE,
  bosses,
  bossPathFor,
  distinctFights,
  expandMove,
  groupByPerson,
  personOf,
  placeOf,
  placeParts,
  slug,
  spriteSrc,
  teamProfile,
  titleCase,
  titlePlace,
  typesOf,
  withOrder,
} from "./data.mjs";
import { esc, modeToggle, shell, typeChip } from "./render.mjs";
import {
  evolutionsPage,
  itemsPage,
  megaStonesPage,
  raidDensPage,
  routePage,
  routesPage,
  tmsPage,
} from "./reference.mjs";
import { calculatorPage, readinessPage, saveImportPage } from "./features.mjs";

const dist = fileURLToPath(new URL("../../dist/", import.meta.url));

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

/** where a fight happens, in prose.
 *
 * The trainer-order row spells the place out in full ("ROUTE 22") while the
 * title carries the detail that tells two fights apart ("ROUTE 22 #1"), so
 * the title wins whenever it is the same place with more on it. A title that
 * names a role instead of a place ("GYM LEADER") is not a place at all. */
function fightPlace(f) {
  const fromOrder = titleCase(f.order?.location ?? "");
  const fromTitle = titleCase(titlePlace(f.boss.title));
  const norm = (x) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (fromTitle && (!fromOrder || norm(fromTitle).startsWith(norm(fromOrder)))) return fromTitle;
  return fromOrder;
}

/** "Sabrina — Saffron City". A place that only repeats the person or their
 * role ("The Champion — Champion") gives way to the category. */
function fightHeading(f, name) {
  const place = fightPlace(f);
  const dupe = place && (place === name || name.includes(place));
  return `${name} — ${(dupe ? "" : place) || titleCase(f.category)}`;
}

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
  const place = fightPlace(f);
  const name = titleCase(person);
  const heading = [
    level === 2 ? fightHeading(f, name) : fightHeading(f, name).split(" — ").slice(1).join(" — "),
    b.subtitle && `(${titleCase(b.subtitle)})`,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const h = `h${level}`;
  // "IF RIVAL HAS BULBASAUR" — one of three teams, and only one of them is
  // yours. Folded so a page of fifteen fights isn't forty-five teams deep;
  // the markup is all still there, which is what a crawler reads.
  const starterVariant = /^IF RIVAL HAS/i.test(b.subtitle ?? "");
  const partners = placeParts(b.title).partners.map((x) => titleCase(x));
  // the place is a page of its own: where the fight happens is also where
  // the player is standing, and the area page has its encounters and items
  const areaPath = routePathFor(f.order?.location ?? titlePlace(b.title));
  const meta = [
    ["Location", place && areaPath ? { html: `<a href="${areaPath}">${esc(place)}</a>` } : place],
    [place ? "Part of" : "Fight", titleCase(f.category)],
    ["Alongside", partners.join(" and ")],
    ["Level cap", capOf(f.order)],
    ["Battle", b.battleEffect ? titleCase(b.battleEffect) : "Single battle"],
    ["Notes", b.notes],
  ].filter(([, v]) => v);
  const open = starterVariant
    ? `<details><summary>${esc(titleCase(b.subtitle))}</summary>`
    : "";
  const close = starterVariant ? "</details>" : "";
  return `${
    starterVariant ? "" : `<${h} id="${mode}-${slug(b.title + " " + (b.subtitle ?? ""))}">${esc(heading)}</${h}>`
  }${open}
<div class="card">
<table><tbody>
${meta
  .map(
    ([k, v]) =>
      `<tr><th>${esc(k)}</th><td${
        k === "Battle" && b.battleEffect ? ' class="effect"' : ""
      }>${v.html ?? esc(v)}</td></tr>`,
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
</div>${close}`;
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
        const page = bossPathFor(name);
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
            // the champion's page is keyed on the fight, not the person —
            // the rival's other fifteen fights have no page
            const entry = BOSS_PAGES.find(
              (b) =>
                (b.person ?? b.slug) === slug(person) &&
                (!b.category || b.category === cat.name),
            );
            const page = entry ? `/bosses/${entry.slug}` : null;
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

/** the fights a boss page covers, in game order. A `category` narrows the
 * person's fights to that one category — how the champion's page exists
 * without dragging in the rival's other fifteen. */
function pageGroup(mode, entry) {
  const group = groupByPerson(mode).get(entry.person ?? entry.slug);
  if (!group) return null;
  if (!entry.category && !entry.exclude) return group;
  const fights = group.fights.filter(
    (f) =>
      (!entry.category || f.category === entry.category) &&
      (!entry.exclude || f.category !== entry.exclude),
  );
  return fights.length ? { ...group, fights } : null;
}

/** Hand-written ledes where there is something specific to say. Everything
 * else is derived below — a made-up sentence per boss would be sixteen
 * chances to state something the data doesn't support. */
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
    lede: `Sabrina's Saffron City gym is a double battle in Radical Red 4.1, and in
Hardcore mode it runs under permanent Trick Room. Her full team for both modes is
below, with the level cap in force and every move, ability and held item.`,
  },
};

/** the copy for a boss page, computed from the fights themselves: how many
 * there are, where they happen, the cap, whether the modes differ. */
function pageCopy(entry) {
  const group = pageGroup("default", entry) ?? pageGroup("hardcore", entry);
  const name = entry.name ?? titleCase(group?.person ?? entry.slug);
  // alternate teams for one fight are one fight: the champion brings three
  // teams depending on your starter, and is fought once
  const fights = distinctFights(withOrder("default", group));
  const places = [
    ...new Set(fights.map((f) => titleCase(f.order?.location ?? titlePlace(f.boss.title)))),
  ].filter(Boolean);
  const isLeader = fights.some((f) => f.category === "Kanto Leaders");
  const isE4 = fights.some((f) => f.category === "Indigo League");
  const role = entry.slug === "champion" ? "Champion" : isE4 ? "Elite Four" : isLeader ? "Gym Leader" : null;
  const multi = fights.length > 1;
  const timesWord = fights.length === 2 ? "twice" : `${fights.length} times`;
  const caps = [...new Set(fights.map((f) => f.order?.levelCap).filter(Boolean))];
  const effects = [...new Set(fights.map((f) => f.boss.battleEffect).filter(Boolean))];

  // does Hardcore bring a different team? Compared by species, so "the same
  // six at different levels" doesn't get called a different team.
  const speciesOf = (g) =>
    (g?.fights ?? []).map((f) => f.boss.pokemon.map((m) => m.species).join(",")).join("|");
  const modesDiffer = speciesOf(pageGroup("default", entry)) !== speciesOf(pageGroup("hardcore", entry));

  const list = (xs) =>
    xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "";

  // how each fight is best identified in prose: where it happens, or, for
  // the ones the trainer order doesn't track, what kind of fight it is
  const qualifiers = fights.map((f) => {
    const p = titleCase(f.order?.location ?? titlePlace(f.boss.title));
    return p && p !== name && !name.includes(p) ? p : `the ${titleCase(f.category)} fight`;
  });
  const ledePlaces = places.filter(
    (p) => p !== name && !name.includes(p) && (!role || p !== role),
  );

  const lede = [
    multi
      ? `${name} is fought ${timesWord} in Radical Red 4.1 — ${list([
          ...new Set(qualifiers),
        ])} — with a different team each time.`
      : (() => {
          const clause = `${role && !name.includes(role) ? `, the ${role.toLowerCase()}` : ""}${
            ledePlaces.length ? ` at ${ledePlaces[0]}` : ""
          }`;
          return clause
            ? `${name}${clause}, in Radical Red 4.1.`
            : `${name} in Radical Red 4.1.`;
        })(),
    // one fight, one cap worth stating up front; with several, each fight's
    // own table carries its own and a single number here would be a lie
    fights.length === 1 && caps.length === 1
      ? `The level cap for the fight is ${caps[0]}.`
      : "",
    effects.length === 0
      ? ""
      : multi
        ? `Some of these fights set permanent conditions of their own — ${list(
            effects.map((e) => titleCase(e)),
          )}.`
        : `It runs under ${list(effects.map((e) => titleCase(e)))}.`,
    modesDiffer
      ? `Hardcore mode brings a different team, and both are below.`
      : `The team is the same in Normal and Hardcore mode.`,
    `Every level, ability, held item, nature and move is the documented 4.1 data.`,
  ]
    .filter(Boolean)
    .join(" ");

  const override = PAGE_COPY[entry.slug] ?? {};
  return {
    name,
    title:
      override.title ??
      (multi
        ? `Radical Red ${name} Teams — All ${fights.length} Fights & Movesets`
        : `Radical Red ${name} Team, Moves & Matchups — 4.1`),
    description:
      override.description ??
      `${name}'s full Radical Red 4.1 team${
        places.length ? ` at ${list(places)}` : ""
      } — levels, moves, abilities, held items and battle conditions, for Normal and Hardcore, with damage-calculator and party matchups.`,
    h1: override.h1 ?? (multi ? `${name} Teams in Radical Red 4.1` : `${name} Boss Fight — Radical Red 4.1`),
    lede: override.lede ?? lede,
  };
}

function bossPage(entry) {
  const copy = pageCopy(entry);
  const panels = MODES.map(({ id, label }) => {
    const group = pageGroup(id, entry);
    if (!group) return { mode: id, label, html: `<p class="muted">Not in this mode.</p>` };
    const fights = withOrder(id, group);
    return {
      mode: id,
      label,
      html:
        fights
          .map((f, i) => {
            // a fight whose teams are starter variants prints its heading
            // once, with the three teams folded underneath it
            const prev = fights[i - 1];
            const head =
              /^IF RIVAL HAS/i.test(f.boss.subtitle ?? "") &&
              (!prev || prev.boss.title !== f.boss.title || prev.category !== f.category)
                ? `<h2 id="${id}-${slug(f.boss.title)}">${esc(
                    fightHeading(f, copy.name),
                  )}</h2><p class="muted">Three teams, one per starter. Open the one your rival took.</p>`
                : "";
            return head + fightSection(f, copy.name, id);
          })
          .join("\n") +
        relatedBosses(id, fights[fights.length - 1]?.orderIndex),
    };
  });
  return shell({
    path: `/bosses/${entry.slug}`,
    title: copy.title,
    description: copy.description,
    h1: copy.h1,
    crumbs: [
      ["/bosses", "Boss teams"],
      [`/bosses/${entry.slug}`, copy.name],
    ],
    body: `<p class="lede">${copy.lede}</p>${modeToggle(entry.slug, panels)}`,
  });
}

/** a compact look at a team: who is on it, without the full cards */
function teamPreview(boss) {
  return `<div class="tags">${boss.pokemon
    .map((m) => {
      const src = spriteSrc(m.species);
      return `<span class="tag">${
        src
          ? `<img src="${src}" alt="" width="24" height="24" loading="lazy" decoding="async">`
          : ""
      }${esc(m.species)} <b>${esc(m.level)}</b></span>`;
    })
    .join("")}</div>`;
}

/** The Elite Four page is a hub, not a fifth copy of five teams: each
 * member's full cards live on their own page, and duplicating them here
 * would split which URL the fight belongs to. */
function eliteFourPage() {
  const panels = MODES.map(({ id, label }) => {
    const cat = bosses[id].categories.find((c) => c.name === "Indigo League");
    const groups = groupByPerson(id);
    const seen = new Set();
    const html = cat.bosses
      .map((b) => {
        const person = personOf(b.title);
        const entry = BOSS_PAGES.find(
          (e) => (e.person ?? e.slug) === slug(person) && (!e.category || e.category === cat.name),
        );
        const fights = withOrder(id, groups.get(slug(person)));
        const f = fights.find((x) => x.boss === b);
        const display = entry?.name ?? titleCase(person);
        const head = seen.has(person)
          ? ""
          : `<h2 id="${id}-${slug(person)}">${esc(display)}</h2>
<p class="muted">${esc(
              [
                f?.order?.location && !display.includes(titleCase(f.order.location))
                  ? titleCase(f.order.location)
                  : "",
                f?.order?.levelCap ? `level cap ${f.order.levelCap}` : "",
              ]
                .filter(Boolean)
                .join(" · "),
            )}</p>
${entry ? `<p><a class="cta" href="/bosses/${entry.slug}">${esc(display)}'s full team</a></p>` : ""}`;
        seen.add(person);
        return `${head}
<h3>${esc(b.subtitle ? titleCase(b.subtitle) : "Team")}${
          b.battleEffect ? ` <span class="effect">· ${esc(titleCase(b.battleEffect))}</span>` : ""
        }</h3>
${teamPreview(b)}`;
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
alternate lineup the game can bring — Lorelei's rain and snow teams, the second
team each of the others can field, and the champion's three teams, one per
starter. Each member's Pokémon are previewed below with the conditions their
fight sets; their own page has the full sets, moves and matchups.</p>
<p><a class="cta" href="/">Check your team against them</a>
<a class="cta ghost" href="/bosses">All boss teams</a>
<a class="cta ghost" href="/level-caps">Level caps</a></p>
${modeToggle("e4", panels)}`,
  });
}

/** GitHub Pages serves this for anything it can't match — a mistyped URL, a
 * link that rotted, or the trailing-slash form of a real page
 * (/bosses/sabrina/ is not a file). Without it that is GitHub's own 404,
 * which has no way back into the site. Not a section, so it bypasses
 * write() and its list check, and it is noindexed rather than canonicalised.
 */
function notFoundPage() {
  return shell({
    path: "/404",
    noindex: true,
    title: "Page not found — Radical Red Tracker",
    description: "That page doesn't exist. The Radical Red 4.1 reference pages are here.",
    h1: "That page doesn't exist",
    body: `<p class="lede">The link may be old, or have a stray slash on the end
— <code>/bosses/sabrina</code> is a page, <code>/bosses/sabrina/</code> is
not. Everything the site has is below.</p>
<p><a class="cta" href="/">Open the tracker</a></p>
<h2>Reference pages</h2>
<ul>
${PUBLISHED.map(
  (x) => `<li><a href="/${x.slug}">${esc(x.label)}</a> — ${esc(x.blurb)}</li>`,
).join("\n")}
</ul>
<h2>Boss pages</h2>
<div class="tags">${BOSS_PAGES.map(
      (b) => `<a class="tag" href="/bosses/${b.slug}">${esc(b.name ?? titleCase(b.person ?? b.slug))}</a>`,
    ).join("")}</div>
<h2>Areas</h2>
<div class="tags">${ROUTE_PAGES.map(
      (r) => `<a class="tag" href="/routes/${r.slug}">${esc(r.name ?? titleCase(r.slug.replace(/-/g, " ")))}</a>`,
    ).join("")}</div>`,
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
for (const p of BOSS_PAGES) write(`/bosses/${p.slug}`, bossPage(p));
write("/elite-four", eliteFourPage());
write("/routes", routesPage());
for (const r of ROUTE_PAGES) write(`/routes/${r.slug}`, routePage(r));
write("/items-tms", itemsPage());
write("/tms", tmsPage());
write("/mega-stones", megaStonesPage());
write("/raid-dens", raidDensPage());
write("/evolutions", evolutionsPage());
write("/damage-calculator", calculatorPage());
write("/battle-readiness", readinessPage());
write("/save-import", saveImportPage());
writeFileSync(dist + "404.html", notFoundPage());
writeFileSync(dist + "sitemap.xml", sitemap());
// what check.mjs walks: every page this run produced, so a new page is
// covered by the regression check without anyone adding it there
writeFileSync(dist + "seo-pages.json", JSON.stringify(written));
console.log(`seo: ${written.length} pages + sitemap.xml`);
