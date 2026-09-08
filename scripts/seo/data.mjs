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
  return (parts.length > 1 ? parts[parts.length - 1] : title).trim();
}

/** the place half of the title, abbreviated as the docs write it */
export function placeOf(title) {
  const parts = title.split("·");
  return parts.length > 1 ? parts.slice(0, -1).join("·").trim() : "";
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

/** attach the trainer-order row (level cap, location, rewards, position) to
 * each fight of a person.
 *
 * The app does this with a fuzzy resolver over the whole order
 * (src/lib/bossTarget.ts) because it must map ALL 96 rows. Here the question
 * is narrower — the rows already share the person's name — so matching the
 * fight's own title-place against the row's location, and falling back to
 * game order, is enough. Fights with no row (postgame extras the order
 * doesn't track) simply carry none. */
export function withOrder(mode, group) {
  const rows = bosses[mode].trainerOrder
    .map((entry, index) => ({ entry, index }))
    .filter((r) => norm(r.entry.name) === norm(group.person));
  const taken = new Set();
  return group.fights.map((f, i) => {
    const place = placeOf(f.boss.title);
    let best = null;
    let bestScore = 0;
    for (const r of rows) {
      if (taken.has(r.index)) continue;
      const s = placeScore(place, r.entry.location ?? "");
      if (s > bestScore) {
        best = r;
        bestScore = s;
      }
    }
    if (!best) best = rows.filter((r) => !taken.has(r.index))[0] ?? null;
    // one fight, one row: a second Giovanni team must not re-claim the first
    // fight's row just because both titles mention Rocket
    if (best) taken.add(best.index);
    return { ...f, order: best?.entry ?? null, orderIndex: best?.index ?? null, seq: i };
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
 * title case; "S.S." and other dotted initialisms keep their capitals. */
export function titleCase(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\s]+/g, (w) =>
      /^([a-z]\.){2,}$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1),
    );
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
