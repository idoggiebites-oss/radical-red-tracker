/** Shared data loading + the few app rules the generator has to know.
 *
 * Node can't import the app's TS libs (they use vite-only JSON imports and
 * `import.meta.env`), so the handful of rules below are deliberate copies —
 * each one names the file it mirrors. Everything else is read straight from
 * the same generated JSON the app ships. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => JSON.parse(readFileSync(root + p, "utf8"));

/** the one list of static sections — see src/lib/seoSections.json. The
 * generator, the sitemap, the service worker denylist (vite.config.ts), the
 * app footer and these pages' own nav all read it, so adding a section is
 * one edit rather than five. */
export const SECTIONS = read("src/lib/seoSections.json").sections;
export const PUBLISHED = SECTIONS.filter((s) => s.published);

export const bosses = read("src/data/bosses.json");
export const types = read("src/data/types.json");
const cleaned = new Set(read("src/data/cleanedSprites.json"));

export const MODES = [
  { id: "default", label: "Normal" },
  { id: "hardcore", label: "Hardcore" },
];

export const SITE = "https://radicalredtracker.com";

/** url-safe slug. Boss deep links are resolved by comparing slugs on the
 * app side too — keep in sync with `slug()` in src/lib/deepLink.ts. */
export function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** the person a fight is named after. Titles are "<PLACE OR ROLE> · <NAME>"
 * ("GYM LEADER · SABRINA", "SILPH CO. · GIOVANNI"), which is what lets all
 * three Giovanni fights share one page. */
export function personOf(title) {
  const parts = title.split("·");
  // tag battles are titled "SILPH CO. · ARIANA · & ARCHER" — the last
  // segment is still the person, with the ampersand joining them
  return (parts.length > 1 ? parts[parts.length - 1] : title).trim().replace(/^&\s*/, "");
}

/** the title's place, and anyone the boss is fought alongside. The docs put
 * both in the same field, separated by the same "·" that separates the
 * person, so "SILPH CO. · ARIANA · & ARCHER" is one fight at Silph Co.
 * against two trainers — not a place called "Silph Co. · Ariana · &". */
export function placeParts(title) {
  const segs = title.split("·").map((x) => x.trim());
  segs.pop();
  const place = segs.shift() ?? "";
  const partners = segs
    .map((x) => x.replace(/^&\s*/, "").trim())
    .filter((x) => x && x !== "&");
  return { place, partners };
}

/** the place half of the title, abbreviated as the docs write it */
export function placeOf(title) {
  return placeParts(title).place;
}

/** every fight in a mode, flattened, in game order (categories are already
 * ordered, and so are the bosses inside them) */
export function fightsOf(mode) {
  const out = [];
  for (const cat of bosses[mode].categories) {
    for (const boss of cat.bosses) {
      out.push({ category: cat.name, boss });
    }
  }
  return out;
}

/** fights grouped by person slug — one group is one boss page */
export function groupByPerson(mode) {
  const groups = new Map();
  for (const f of fightsOf(mode)) {
    const person = personOf(f.boss.title);
    const key = slug(person);
    if (!groups.has(key)) groups.set(key, { slug: key, person, fights: [] });
    groups.get(key).fights.push(f);
  }
  return groups;
}

const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** how well a fight's title-place matches a trainer-order row's location.
 * The docs abbreviate one side and not the other ("CERULEA. CAVE" vs
 * "CERULEAN CAVE"), so words match on shared prefix. */
function placeScore(place, location) {
  const a = norm(place).split(" ").filter(Boolean);
  const b = norm(location).split(" ").filter(Boolean);
  if (!a.length || !b.length) return 0;
  return a.filter((w) =>
    b.some((v) => (w.length > 2 && v.startsWith(w.slice(0, 3))) || v === w),
  ).length;
}

/** title prefixes that name a ROLE rather than a place. "GYM LEADER ·
 * BROCK" says nothing about Pewter City, so these must never be used as a
 * location — a page that calls "Gym Leader" a place reads like a machine
 * wrote it, because one did. */
const ROLE_PREFIXES = new Set([
  "GYM LEADER",
  "ELITE FOUR",
  "CHAMPION",
  "PARTNER",
  "LEADER",
  "RIVAL",
]);

/** the place a fight's title names, or "" when the prefix is a role */
export function titlePlace(title) {
  const place = placeOf(title);
  return ROLE_PREFIXES.has(norm(place)) ? "" : place;
}

/** distinct fights, keyed by category and title. Alternate teams for one
 * fight (the Elite Four's TEAM ONE/TWO, the champion's three
 * starter-dependent teams) share a key: they are one fight in the game and
 * one row in the trainer order, however many teams it can bring. */
function fightKey(f) {
  return `${f.category}|${f.boss.title}`;
}

/** attach the trainer-order row (level cap, location, rewards, position) to
 * each fight of a person.
 *
 * The app does this with a fuzzy resolver over the whole order
 * (src/lib/bossTarget.ts) because it must map ALL 96 rows. Here the question
 * is narrower — the rows already share the person's name — so a real
 * location match wins first, and only then does what's left fall back to
 * game order.
 *
 * Both halves are load-bearing. Scored-first is what stops Lance's Team
 * Rocket partner fight, which comes earlier, from claiming the row that says
 * ELITE FOUR; order-second is what still finds Brock's gym row, whose title
 * prefix is a role and scores nothing against "PEWTER CITY". Fights the
 * order doesn't track at all — rematches, postgame — end up with no row,
 * which is the truth about them. */
export function withOrder(mode, group) {
  if (!group) return [];
  const rows = bosses[mode].trainerOrder
    .map((entry, index) => ({ entry, index }))
    .filter((r) => norm(r.entry.name) === norm(group.person));

  const keys = [...new Set(group.fights.map(fightKey))];
  const assigned = new Map();
  const taken = new Set();

  // pass 1: real location matches, best score first, so a strong match is
  // never beaten to its row by an earlier fight that doesn't match at all
  const scored = [];
  for (const key of keys) {
    const fight = group.fights.find((f) => fightKey(f) === key);
    for (const r of rows) {
      const score = placeScore(placeOf(fight.boss.title), r.entry.location ?? "");
      if (score > 0) scored.push({ key, r, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  for (const { key, r } of scored) {
    if (assigned.has(key) || taken.has(r.index)) continue;
    assigned.set(key, r);
    taken.add(r.index);
  }

  // pass 2: whatever is left, in game order
  for (const key of keys) {
    if (assigned.has(key)) continue;
    const r = rows.find((x) => !taken.has(x.index));
    if (!r) continue;
    assigned.set(key, r);
    taken.add(r.index);
  }

  return group.fights.map((f, i) => {
    const r = assigned.get(fightKey(f));
    return { ...f, order: r?.entry ?? null, orderIndex: r?.index ?? null, seq: i };
  });
}

/** one entry per distinct fight (alternate teams collapsed) */
export function distinctFights(fights) {
  const seen = new Set();
  return fights.filter((f) => {
    const k = fightKey(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** local mirror path for a species sprite, or null if the dex has no id for
 * it. Mirrors the front of the chain in src/lib/sprites.ts — the hand-cleaned
 * copy where one exists, else the mirrored dex sprite. The remote fallbacks
 * are deliberately dropped: a static page shouldn't hang a request on
 * Showdown for art the mirror already has. */
export function spriteSrc(species) {
  const id = types.spriteIds?.[species];
  if (id === undefined) return null;
  return cleaned.has(id) ? `/sprites/custom/${id}.png` : `/sprites/species/${id}.png`;
}

export const typesOf = (species) => types.species[species] ?? [];

/** copied from ABILITY_MODS in src/lib/effectiveness.ts */
const ABILITY_MODS = {
  Levitate: { Ground: 0 },
  "Earth Eater": { Ground: 0 },
  "Water Absorb": { Water: 0 },
  "Storm Drain": { Water: 0 },
  "Dry Skin": { Water: 0 },
  "Volt Absorb": { Electric: 0 },
  "Lightning Rod": { Electric: 0 },
  "Motor Drive": { Electric: 0 },
  "Flash Fire": { Fire: 0 },
  "Well-Baked Body": { Fire: 0 },
  "Sap Sipper": { Grass: 0 },
  "Thick Fat": { Fire: 0.5, Ice: 0.5 },
  Heatproof: { Fire: 0.5 },
  "Purifying Salt": { Ghost: 0.5 },
  Fluffy: { Fire: 2 },
};

export const ALL_TYPES = Object.keys(types.matchup);

/** attacking type -> multiplier vs this Pokémon (only non-neutral).
 * Same rules as defensiveProfile() in src/lib/effectiveness.ts. */
export function defensiveProfile(species, ability) {
  const defTypes = types.species[species];
  if (!defTypes) return {};
  const mods = ability ? ABILITY_MODS[ability] : undefined;
  const out = {};
  for (const atk of ALL_TYPES) {
    let m = 1;
    for (const d of defTypes) m *= types.matchup[atk][d] ?? 1;
    if (mods && atk in mods) m = mods[atk] === 0 ? 0 : m * mods[atk];
    if (m !== 1) out[atk] = m;
  }
  return out;
}

/** how many of a team are weak to / immune to each attacking type */
export function teamProfile(team) {
  const weak = {};
  const immune = {};
  const resist = {};
  for (const mon of team) {
    const prof = defensiveProfile(mon.species, mon.ability);
    for (const [type, m] of Object.entries(prof)) {
      if (m >= 2) weak[type] = (weak[type] ?? 0) + 1;
      else if (m === 0) immune[type] = (immune[type] ?? 0) + 1;
      else if (m < 1) resist[type] = (resist[type] ?? 0) + 1;
    }
  }
  const rank = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { weak: rank(weak), immune: rank(immune), resist: rank(resist) };
}

export const typeColor = (t) => types.colors[t] ?? "#666";

/** The docs write every name in caps. Headings and prose read better in
 * title case — with three exceptions the docs' own spelling depends on:
 * dotted initialisms ("S.S."), floor suffixes ("B1F", "3&5F", which
 * title-casing alone turns into the unreadable "B1f"), and the abbreviation
 * the location sheet uses for Pokémon Tower, which nobody searches for. */
export function titleCase(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\s]+/g, (w) => {
      if (/^([a-z]\.){2,}$/.test(w)) return w.toUpperCase();
      if (/^b?[\d&]+f$/.test(w) || /^b\d+f-b\d+f$/.test(w)) return w.toUpperCase();
      if (w === "pkmn") return "Pokémon";
      // capitalise the first LETTER, not the first character — "(zone 1)"
      return w.replace(/[a-z]/, (c) => c.toUpperCase());
    });
}

/** The docs truncate a handful of move names to fit their own column
 * ("High Horsep."). The app expands them for the calculator
 * (resolveMove in src/lib/damagecalc.ts); pages have to as well, or they
 * publish a name nobody searches for. Only an unambiguous prefix expands. */
const MOVE_NAMES = Object.values(read("src/data/moveIds.json"));
export function expandMove(name) {
  if (!name.endsWith(".")) return name;
  const prefix = name.slice(0, -1);
  const hits = MOVE_NAMES.filter((m) => m.startsWith(prefix));
  return hits.length === 1 ? hits[0] : name;
}

export const encounters = read("src/data/encounters.json");
export const items = read("src/data/items.json");

/** copied from METHOD_LABELS in src/lib/methods.ts — the tracker and these
 * pages must not name the same encounter slot differently */
export const METHOD_LABELS = {
  grass_day: "Grass / Cave · Day",
  grass_night: "Grass / Cave · Night",
  old_rod: "Old Rod",
  good_rod: "Good Rod",
  super_rod: "Super Rod",
  surfing: "Surfing",
};

/** copied from src/lib/routeGroups.ts — the same folding the tracker does,
 * so a page covers the area a player thinks of as one place (Mt. Moon, not
 * Mt. Moon 1F/B1F/B2F). Keep the two in step. */
const SECTION_SUFFIX = / ((?:B?\d+[&-])?B?\d+F(?:-B?\d+F)?)$/;
const EXPLICIT_SECTIONS = {
  "FOREST EXPANSION": { base: "VIRIDIAN FOREST", label: "FOREST EXPANSION" },
  "MT. EMBER EXTERIOR": { base: "MT. EMBER", label: "EXTERIOR" },
  "SAFARI CENTER (ZONE 1)": { base: "SAFARI ZONE", label: "CENTER (ZONE 1)" },
  "SAFARI EAST (ZONE 2)": { base: "SAFARI ZONE", label: "EAST (ZONE 2)" },
  "SAFARI NORTH (ZONE 3)": { base: "SAFARI ZONE", label: "NORTH (ZONE 3)" },
  "SAFARI WEST (ZONE 4)": { base: "SAFARI ZONE", label: "WEST (ZONE 4)" },
  "SAFARI FAR-WEST (ZONE 5)": { base: "SAFARI ZONE", label: "FAR-WEST (ZONE 5)" },
  "ROUTE 21A": { base: "ROUTE 21", label: "21A" },
  "ROUTE 21B": { base: "ROUTE 21", label: "21B" },
};

function splitLocationName(name) {
  const ex = EXPLICIT_SECTIONS[name];
  if (ex) return ex;
  const m = name.match(SECTION_SUFFIX);
  if (m) return { base: name.slice(0, m.index), label: m[1] };
  return { base: name, label: null };
}

/** doc locations folded into the areas a player names */
export function locationGroups() {
  const groups = [];
  const byBase = new Map();
  for (const loc of encounters.locations) {
    const { base, label } = splitLocationName(loc.name);
    let g = byBase.get(base);
    if (!g) {
      g = { id: loc.id, slug: slug(base), name: base, postgame: loc.postgame, sections: [] };
      byBase.set(base, g);
      groups.push(g);
    }
    g.postgame = g.postgame && loc.postgame;
    g.sections.push({ label, loc });
  }
  return groups;
}

/** the boss pages that are published. The generator can produce one for any
 * name in the data; a `category` narrows it to that name's fights in one
 * category, which is what separates the champion from the fifteen other
 * fights the rival turns up in.
 *
 * The rival himself has no page yet: fifteen fights, each with three
 * starter-dependent teams, is a different kind of page and needs its own
 * explanation of which team you get. */
export const BOSS_PAGES = [
  { slug: "brock" },
  { slug: "misty" },
  { slug: "lt-surge" },
  { slug: "erika" },
  { slug: "koga" },
  { slug: "sabrina" },
  { slug: "blaine" },
  { slug: "clair" },
  { slug: "giovanni" },
  { slug: "archer" },
  { slug: "ariana" },
  { slug: "lorelei" },
  { slug: "bruno" },
  { slug: "agatha" },
  { slug: "lance" },
  { slug: "champion", person: "rival", category: "Indigo League", name: "The Champion" },
  // the Johto leaders RR sprinkles in as extra fights — no badge, but a
  // gym leader's name is what people search
  { slug: "falkner" },
  { slug: "bugsy" },
  { slug: "whitney" },
  { slug: "morty" },
  { slug: "chuck" },
  { slug: "pryce" },
  { slug: "jasmine" },
  // postgame fights worth a page on the name alone
  { slug: "oak" },
  { slug: "red" },
  // fifteen fights, three teams each. The starter-dependent teams fold into
  // <details> or the page is unreadable.
  { slug: "rival", exclude: "Indigo League" },
];
const bossPageSlugs = BOSS_PAGES.map((p) => p.slug);


/** the boss page covering a trainer named in the order, or null. Called with
 * a name alone, so it takes the entry that isn't narrowed to one category —
 * the rival's own page rather than the champion's. Route pages never show
 * the champion's row (its "location" is CHAMPION, which is no area), so the
 * ambiguity can't reach a reader. */
export function bossPathFor(name) {
  const key = slug(name);
  const entry =
    BOSS_PAGES.find((b) => (b.person ?? b.slug) === key && !b.category) ??
    BOSS_PAGES.find((b) => (b.person ?? b.slug) === key);
  return entry ? `/bosses/${entry.slug}` : null;
}

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

// the location sheet writes PKMN TOWER, the item sheet writes Pokemon Tower.
// Stricter than `norm` above: no spaces at all, so "MT MOON" and "Mt. Moon"
// are the same string.
const normArea = (s) =>
  String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PKMN/, "POKEMON");

/** the same area under two spellings — "MT MOON" and "Mt. Moon", "SEAFOAM"
 * and "Seafoam Islands". Prefix matching, but never across a number
 * boundary, or Route 1 would swallow Routes 10 through 19. */
export function sameArea(a, b) {
  const x = normArea(a);
  const y = normArea(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && !/\d/.test(long[short.length]);
}


/** the area page for a location as some other sheet spells it — the boss
 * docs say "PEWTER CITY", the location sheet "PEWTER CITY", the item sheet
 * "Pewter City", and Mt. Moon is "MT MOON" in one and "Mt. Moon" in another. */
export function routePathFor(locationName) {
  if (!locationName) return null;
  const g = locationGroups().find((x) => sameArea(x.name, locationName));
  const entry = g && ROUTE_PAGES.find((r) => r.area === g.slug);
  return entry ? `/routes/${entry.slug}` : null;
}
