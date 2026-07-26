/** Mirror every sprite the app can show into public/sprites/.
 *
 * Deliberately drives the app's OWN url-building code (src/lib/sprites.ts,
 * src/lib/itemSprites.ts) rather than reimplementing the slug/alias rules:
 * those tables have drifted from a copy before and the failure is silent —
 * a sprite that resolves in the browser but was never mirrored just falls
 * back to the network, so nothing looks broken while the whole point of
 * the exercise quietly leaks away.
 *
 * Run from the project root:  node scripts/fetch_sprites.mjs [--force]
 *
 * Existing hand-cleaned files (sprites/custom, and the alpha-fixed subset of
 * sprites/items) are never overwritten — their whole reason to exist is
 * that the upstream copy is worse.
 */
import { build } from "vite";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = process.cwd();
const FORCE = process.argv.includes("--force");
const OUT_SPECIES = path.join(ROOT, "public/sprites/species");
const OUT_ITEMS = path.join(ROOT, "public/sprites/items");
const OUT_ITEMS_BY_NAME = path.join(ROOT, "public/sprites/items-name");
const CONCURRENCY = 8;

/** bundle the app's sprite modules so we can call them from node */
async function loadSpriteLogic() {
  const tmp = path.join(os.tmpdir(), `rr-sprites-${Date.now()}`);
  const entry = path.join(tmp, "entry.ts");
  await mkdir(tmp, { recursive: true });
  await writeFile(
    entry,
    `export { spriteUrls } from ${JSON.stringify(path.join(ROOT, "src/lib/sprites.ts"))};
     export { itemSpriteUrls } from ${JSON.stringify(path.join(ROOT, "src/lib/itemSprites.ts"))};
     export { ITEM_NAMES } from ${JSON.stringify(path.join(ROOT, "src/lib/damagecalc.ts"))};`,
  );
  await build({
    root: ROOT,
    logLevel: "error",
    build: {
      write: true,
      outDir: tmp,
      emptyOutDir: false,
      lib: { entry, formats: ["es"], fileName: "sprite-logic" },
      minify: false,
    },
  });
  return import(path.join(tmp, "sprite-logic.js"));
}

const isRemote = (u) => u.startsWith("http://") || u.startsWith("https://");

async function fetchFirst(urls) {
  for (const url of urls.filter(isRemote)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        if (!res.ok) break; // a real 404: move to the next url in the chain
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0) return { buf, url };
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  return null;
}

async function pool(jobs, worker) {
  let i = 0;
  const results = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < jobs.length) {
        const idx = i++;
        results[idx] = await worker(jobs[idx], idx);
      }
    }),
  );
  return results;
}

const json = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));

/** every item name the UI can render, keyed by the id its sprite lands on —
 * the display name matters because the PokeAPI url is built from it */
async function itemDisplayNames(extraItemNames = []) {
  const items = await json("src/data/items.json");
  const bosses = await json("src/data/bosses.json");
  const names = new Set();
  for (const list of [items.megaStones, items.zCrystals]) {
    for (const it of list ?? []) if (it?.name) names.add(it.name);
  }
  for (const area of items.overworld ?? []) {
    for (const it of area.items ?? []) if (it?.name) names.add(it.name);
  }
  for (const mode of Object.values(bosses)) {
    for (const cat of mode.categories ?? []) {
      for (const boss of cat.bosses ?? []) {
        for (const mon of boss.pokemon ?? []) if (mon?.item) names.add(mon.item);
      }
    }
  }
  // the build editor's held-item field offers the whole engine list, so any
  // of these can be rendered even though the docs never mention them
  for (const n of extraItemNames) names.add(n);
  return [...names];
}

const { spriteUrls, itemSpriteUrls, ITEM_NAMES } = await loadSpriteLogic();
await mkdir(OUT_SPECIES, { recursive: true });
await mkdir(OUT_ITEMS, { recursive: true });
await mkdir(OUT_ITEMS_BY_NAME, { recursive: true });

// ---- species ----
const types = await json("src/data/types.json");
const speciesIds = types.spriteIds ?? {};
const species = Object.keys(speciesIds);

let sKept = 0, sGot = 0, sMiss = 0, sBytes = 0;
const missingSpecies = [];
await pool(species, async (name) => {
  const id = speciesIds[name];
  if (id === undefined || id === null) return;
  const dest = path.join(OUT_SPECIES, `${id}.png`);
  // a hand-cleaned custom already wins the chain — don't spend a request
  if (existsSync(path.join(ROOT, "public/sprites/custom", `${id}.png`))) { sKept++; return; }
  if (!FORCE && existsSync(dest)) { sKept++; return; }
  const hit = await fetchFirst(spriteUrls(name));
  if (!hit) { sMiss++; missingSpecies.push(name); return; }
  await writeFile(dest, hit.buf);
  sGot++; sBytes += hit.buf.length;
});

// ---- items ----
const names = await itemDisplayNames(ITEM_NAMES ?? []);
let iKept = 0, iGot = 0, iMiss = 0, iBytes = 0;
const missingItems = [];
// the RR dex serves PNGs with the chroma-key background baked in — anything
// mirrored from there needs scripts/clean_rrdex_items.py run over it, or the
// icon ships with a solid green/grey box behind it
const needCleaning = [];
await pool(names, async (name) => {
  const urls = itemSpriteUrls(name);
  if (urls.length === 0) return; // "no item" placeholder
  // the app looks for sprites/items/<id>.png first; mine the id back out of
  // that url so the mirror lands exactly where it will be looked for
  const locals = urls.filter((u) => !isRemote(u));
  const id = locals.find((u) => /\/items\/\d+\.png$/.test(u))?.match(/(\d+)\.png$/)?.[1];
  // no dex id: fall back to mirroring under the name slug instead, which is
  // the only local path those items have (see itemSprites.ts)
  const slug = locals.find((u) => u.includes("/items-name/"))?.match(/([a-z0-9-]+)\.png$/)?.[1];
  if (!id && !slug) return;
  const dest = id
    ? path.join(OUT_ITEMS, `${id}.png`)
    : path.join(OUT_ITEMS_BY_NAME, `${slug}.png`);
  if (!FORCE && existsSync(dest)) { iKept++; return; }
  const hit = await fetchFirst(urls);
  if (!hit) { iMiss++; missingItems.push(name); return; }
  await writeFile(dest, hit.buf);
  if (hit.url.includes("Radical-Red-Pokedex") && id) needCleaning.push(id);
  iGot++; iBytes += hit.buf.length;
});

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`species: ${sGot} fetched (${kb(sBytes)}), ${sKept} already local, ${sMiss} unresolved`);
console.log(`items:   ${iGot} fetched (${kb(iBytes)}), ${iKept} already local, ${iMiss} unresolved`);
if (missingSpecies.length)
  console.log(`\nunresolved species (still fall back to the network):\n  ${missingSpecies.slice(0, 40).join(", ")}${missingSpecies.length > 40 ? ` … +${missingSpecies.length - 40}` : ""}`);
if (missingItems.length)
  console.log(`\nunresolved items:\n  ${missingItems.slice(0, 40).join(", ")}${missingItems.length > 40 ? ` … +${missingItems.length - 40}` : ""}`);
if (needCleaning.length) {
  console.log(
    `\n${needCleaning.length} item sprite(s) came from the RR dex and still have a` +
    ` baked-in background. Clean them with:\n` +
    `  python3 scripts/clean_rrdex_items.py ${needCleaning.join(" ")}`,
  );
}
