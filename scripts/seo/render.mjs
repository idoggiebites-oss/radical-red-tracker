/** The page shell every generated page shares: head tags, nav, footer, and
 * the one inline stylesheet.
 *
 * These pages are plain HTML on purpose — no React, no hydration. They are
 * reference documents built from the same JSON the app reads, and their job
 * is to be complete before any script runs; the app itself is one click away
 * on every one of them. */
import { SITE, typeColor } from "./data.mjs";

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** the site-wide nav, repeated on every page: real <a href>s, so the whole
 * set is reachable by a crawler from any one of them */
const NAV = [
  ["/", "Tracker"],
  ["/level-caps", "Level caps"],
  ["/bosses", "Boss teams"],
  ["/elite-four", "Elite Four"],
];

const CSS = `
:root{--bg:#12151c;--bg2:#191d27;--bg3:#212636;--line:#2d3348;--text:#e6e9f2;
--muted:#8b93ab;--accent:#e05252;--accent2:#ffb454;--caught:#4caf7d;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
font:15px/1.5 system-ui,"Segoe UI",sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:0 16px 56px}
a{color:var(--accent2)}
h1{font-size:26px;margin:18px 0 6px}
h2{font-size:20px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{font-size:16px;margin:22px 0 8px}
p{margin:8px 0}
.lede{color:var(--muted);max-width:70ch}
header.site{border-bottom:1px solid var(--line);background:var(--bg2)}
header.site .wrap{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:10px 16px}
header.site strong{margin-right:auto;font-size:15px}
header.site a{color:var(--text);text-decoration:none;font-size:14px}
header.site a:hover{color:var(--accent2)}
nav.crumbs{font-size:13px;color:var(--muted);margin:14px 0 0}
nav.crumbs a{color:var(--muted)}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14px}
.scroll{overflow-x:auto}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600;white-space:nowrap}
tbody tr:hover{background:var(--bg2)}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;
border-radius:6px;padding:8px 14px;margin:4px 8px 4px 0;font-weight:600;font-size:14px}
.cta.ghost{background:var(--bg3);color:var(--text);border:1px solid var(--line);font-weight:500}
.cta:hover{filter:brightness(1.1)}
.card{background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:12px 0}
.mons{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.mon{background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:10px}
.mon .top{display:flex;gap:8px;align-items:center}
.mon img{width:56px;height:56px;image-rendering:pixelated;flex:none}
.mon .name{font-weight:600}
.mon dl{margin:8px 0 0;display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:13px}
.mon dt{color:var(--muted)}
.mon dd{margin:0}
.moves{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px}
.moves li{background:var(--bg3);border:1px solid var(--line);border-radius:5px;
padding:2px 7px;font-size:12.5px}
.chip{display:inline-block;border-radius:5px;padding:1px 7px;font-size:12px;
color:#12151c;font-weight:700;margin-right:4px}
.effect{color:var(--accent2);font-weight:600}
.muted{color:var(--muted)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.tag{background:var(--bg3);border:1px solid var(--line);border-radius:999px;
padding:2px 10px;font-size:12.5px}
.tag b{color:var(--accent);font-weight:700}
/* mode toggle: both modes are in the HTML, CSS shows one. No script, so the
   page is complete for a crawler and switchable for a reader. */
.modes{margin:16px 0 0}
.modes>input{position:absolute;opacity:0;pointer-events:none}
.modes>label{display:inline-block;border:1px solid var(--line);background:var(--bg2);
padding:6px 14px;font-size:14px;cursor:pointer}
.modes>label:first-of-type{border-radius:7px 0 0 7px}
.modes>label:last-of-type{border-radius:0 7px 7px 0;border-left:0}
.modes>input:checked+label{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.modes>input:focus-visible+label{outline:2px solid var(--accent2);outline-offset:2px}
.m-default:checked~.panels>.p-hardcore,.m-hardcore:checked~.panels>.p-default{display:none}
footer.site{border-top:1px solid var(--line);margin-top:40px;padding:16px 0;color:var(--muted);font-size:13px}
`;

export function typeChip(t) {
  return `<span class="chip" style="background:${typeColor(t)}">${esc(t)}</span>`;
}

/** @param {{path:string,title:string,description:string,h1:string,body:string,
 * crumbs?:[string,string][], jsonLd?:object[]}} p */
export function shell(p) {
  const url = SITE + p.path;
  const crumbs = p.crumbs ?? [];
  const ld = [
    ...(crumbs.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [["/", "Radical Red Tracker"], ...crumbs].map(
              ([href, name], i) => ({
                "@type": "ListItem",
                position: i + 1,
                name,
                item: SITE + href,
              }),
            ),
          },
        ]
      : []),
    ...(p.jsonLd ?? []),
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#12151c">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:site_name" content="Radical Red Tracker">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${SITE}/pwa-512.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${SITE}/pwa-512.png">
<style>${CSS}</style>
${ld.length ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ""}
</head>
<body>
<header class="site"><div class="wrap">
<strong><a href="/">Radical Red Tracker</a></strong>
${NAV.filter(([href]) => href !== p.path)
  .map(([href, label]) => `<a href="${href}">${esc(label)}</a>`)
  .join("\n")}
</div></header>
<div class="wrap">
${
  crumbs.length
    ? `<nav class="crumbs"><a href="/">Home</a>${crumbs
        .map(([href, name], i) =>
          i === crumbs.length - 1
            ? ` › <span>${esc(name)}</span>`
            : ` › <a href="${href}">${esc(name)}</a>`,
        )
        .join("")}</nav>`
    : ""
}
<h1>${esc(p.h1)}</h1>
${p.body}
</div>
<footer class="site"><div class="wrap">
Teams, levels and level caps come from the official Pokémon Radical Red 4.1
documents (Default &amp; Hardcore Mode Bosses, Pokémon Locations &amp; Raid Dens) —
the same data the <a href="/">tracker</a> runs on. Radical Red is a fan-made
ROM hack by Soupercell; this site is not affiliated with it or with Nintendo.
</div></footer>
</body>
</html>`;
}

/** the Normal/Hardcore switch. `panels` is [{mode,label,html}]. */
export function modeToggle(id, panels) {
  return `<div class="modes">
${panels
  .map(
    (p, i) =>
      `<input type="radio" name="${id}" id="${id}-${p.mode}" class="m-${p.mode}"${
        i === 0 ? " checked" : ""
      }><label for="${id}-${p.mode}">${esc(p.label)}</label>`,
  )
  .join("\n")}
<div class="panels">
${panels.map((p) => `<section class="p-${p.mode}">${p.html}</section>`).join("\n")}
</div></div>`;
}
