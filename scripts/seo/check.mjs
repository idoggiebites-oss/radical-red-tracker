/** Regression check for the static reference pages, run against a real
 * browser: `npm run check:seo` (after `npm run build`).
 *
 * The thing worth testing is NOT that a page loads — a cold browser fetches
 * it from the server and it always will. It is that the page survives a
 * WARM SERVICE WORKER. These files are written after `vite build`, so they
 * are never in the precache manifest, and workbox's navigation fallback will
 * answer any navigation it recognises with the SPA shell. That failure only
 * appears on the second visit, which is every returning visitor and none of
 * the crawlers, so nothing else here would catch it.
 *
 * Also checks the other half of the deal: that a page's CTA lands on the
 * right app state, since a reference page that dead-ends is the whole point
 * missed. */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:4178";
const RUN = JSON.stringify({
  runs: [
    {
      id: "run-check",
      name: "Check",
      mode: "default",
      createdAt: Date.now(),
      encounters: {},
      defeated: {},
      speciesMap: {},
    },
  ],
  activeRunId: "run-check",
});

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(name);
};

const server = spawn("npx", ["vite", "preview", "--port", "4178"], {
  stdio: "ignore",
});
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(BASE + "/");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const ctx = await browser.newContext();
  await ctx.addInitScript((s) => localStorage.setItem("rr-tracker.v1", s), RUN);
  const page = await ctx.newPage();

  // install the worker the way a first visit does, then reload so the page
  // is actually CONTROLLED by it — an installed-but-not-controlling worker
  // intercepts nothing, and would let every assertion below pass on a build
  // with no denylist at all
  await page.goto(BASE + "/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const controlled = await page.evaluate(
    () => !!navigator.serviceWorker.controller,
  );
  check("service worker controls the page", controlled);
  if (!controlled) throw new Error("nothing below would mean anything");

  // every page the build produced, read from what it wrote — a new page is
  // covered here by existing, rather than by someone remembering this file
  const pages = JSON.parse(readFileSync(new URL("../../dist/seo-pages.json", import.meta.url)));
  for (const path of pages) {
    await page.goto(BASE + path);
    const seen = await page.evaluate(() => ({
      shell: !!document.querySelector("#root"),
      h1: document.querySelector("h1")?.textContent ?? "",
    }));
    check(
      `${path} serves its own document to a controlled page`,
      !seen.shell && seen.h1.length > 0,
      seen.shell ? "got the app shell" : "no h1",
    );
  }

  // the 404 document itself. Its real behaviour — GitHub Pages serving it
  // for an unmatched path — can only be checked against the deployed site;
  // `vite preview` answers unknown paths with the SPA shell and a 200, so
  // asserting that here would be testing the preview server, not the site.
  await page.goto(BASE + "/404.html");
  const notFound = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent ?? "",
    noindex: document.querySelector('meta[name="robots"]')?.content ?? "",
    links: document.querySelectorAll("a[href]").length,
  }));
  check(
    "/404.html is our page, noindexed, and links back in",
    notFound.h1.includes("doesn't exist") &&
      notFound.noindex === "noindex" &&
      notFound.links > 50,
    JSON.stringify(notFound),
  );

  // the cross-links between the two big page families
  await page.goto(BASE + "/bosses/brock");
  const toArea = await page.locator('a[href="/routes/pewter-city"]').count();
  check("a boss page links to the area it happens in", toArea > 0);
  await page.goto(BASE + "/routes/pewter-city");
  const toBoss = await page.locator('a[href="/bosses/brock"]').count();
  check("an area page links to the bosses fought there", toBoss > 0);

  // the two the fallback would have swallowed, by name
  for (const [path, needle] of [
    ["/level-caps", "Radical Red 4.1 Level Caps"],
    ["/bosses/sabrina", "Sabrina Boss Fight"],
  ]) {
    await page.goto(BASE + path);
    const h1 = (await page.locator("h1").first().textContent()) ?? "";
    check(`${path} is the right document`, h1.includes(needle), h1);
  }

  // the CTAs land somewhere real. A missing link is a failed check, not a
  // crash — when the pages above are being hijacked there is nothing here to
  // find, and the run still has to print why.
  const ctaHref = async (match) => {
    await page.goto(BASE + "/bosses/sabrina");
    try {
      return await page
        .locator(`a[href*="${match}"]`)
        .first()
        .getAttribute("href", { timeout: 5000 });
    } catch {
      return null;
    }
  };

  const readiness = await ctaHref("to=readiness");
  if (!readiness) check("readiness CTA exists on the Sabrina page", false);
  else {
  await page.goto(BASE + readiness);
  await page.waitForTimeout(1500);
  const picked = await page
    .locator("select")
    .evaluateAll((els) => els.map((e) => e.selectedOptions[0]?.textContent ?? ""));
  check(
    "readiness CTA opens Battle readiness on that fight",
    picked.some((p) => p.includes("SABRINA")),
    picked.join(" / "),
  );
  }

  const calc = await ctaHref("to=calc");
  if (!calc) check("calculator CTA exists on the Sabrina page", false);
  else {
  await page.goto(BASE + calc);
  await page.waitForTimeout(1500);
  const seeded = await page
    .locator("input")
    .evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
  check(
    "calculator CTA seeds the Opponent with the boss's lead",
    seeded.some((v) => v === "Hatterene"),
    seeded.slice(0, 4).join(" / "),
  );
  }
  for (const [path, sub] of [
    ["/?to=readiness", "Battle readiness"],
    ["/?to=calc", "Calculator"],
  ]) {
    await page.goto(BASE + path);
    await page.waitForTimeout(1200);
    const active = await page
      .locator("button.active")
      .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    check(`${path} opens ${sub}`, active.some((t) => t.includes(sub)), active.join(" / "));
  }
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nall good");
