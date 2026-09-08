/** Deep links from the static reference pages (scripts/seo/build.mjs) into
 * the app: `/?cat=<category>&boss=<title>&to=readiness`.
 *
 * Those pages are generated from the same bosses.json the app reads, so a
 * fight is addressed the way the app already addresses one — category and
 * title (see BossTarget) — slugged on both sides. Nothing else in the app
 * reads the URL; this is consumed once on boot and then wiped from the
 * address bar so a reload doesn't re-apply it. */
import type { BossMode } from "../types";
import type { BossTarget } from "./bossTarget";

/** keep in sync with slug() in scripts/seo/data.mjs */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type DeepLinkDest = "bosses" | "readiness" | "calc";

export interface DeepLink {
  /** the fight named by the link, if it named one. The feature pages
   * (/damage-calculator, /battle-readiness) link to the tool with no boss
   * attached — they are selling the tool, not a matchup. */
  target: BossTarget | null;
  to: DeepLinkDest;
}

/** what this URL asks for, resolved against the boss data, or null. A link
 * naming a fight the data no longer has resolves to nothing rather than
 * dropping the visitor somewhere arbitrary. */
export function readDeepLink(modeData: BossMode): DeepLink | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("to");
  const to: DeepLinkDest | null =
    raw === "readiness" || raw === "calc" || raw === "bosses" ? raw : null;
  const cat = params.get("cat");
  const boss = params.get("boss");
  if (!cat || !boss) return to && to !== "bosses" ? { target: null, to } : null;
  const category = modeData.categories.find((c) => slug(c.name) === cat);
  const hit = category?.bosses.find((b) => slug(b.title) === boss);
  if (!category || !hit) return null;
  return {
    target: { category: category.name, title: hit.title },
    to: to ?? "bosses",
  };
}

/** drop the query string once it has been acted on, keeping the entry in
 * place so Back still returns to the page that linked here */
export function clearDeepLink(): void {
  window.history.replaceState(null, "", window.location.pathname);
}
