import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Cloudflare Web Analytics. Cloudflare can't inject this itself: that only
// happens for proxied traffic, and our DNS records are deliberately
// unproxied so GitHub Pages can answer the certificate challenge directly
// (see public/CNAME). So the beacon has to ship inside the page.
//
// Injected at build time only. Sitting in index.html it would also load on
// the dev server, pulling a third-party script into every dev session and
// reporting localhost traffic. The token is public by design — it is served
// in the HTML to every visitor.
const CF_BEACON_TOKEN = '85bfd9c26dc74936b00f49368abfc202'

function cloudflareAnalytics(): Plugin {
  return {
    name: 'cf-web-analytics',
    apply: 'build',
    transformIndexHtml: () => [
      {
        // type="module" is deferred by default, so this never blocks paint;
        // if it fails to load (offline, blocked) the app is unaffected
        tag: 'script',
        attrs: {
          type: 'module',
          src: 'https://static.cloudflareinsights.com/beacon.min.js',
          'data-cf-beacon': JSON.stringify({ token: CF_BEACON_TOKEN }),
        },
        injectTo: 'body',
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cloudflareAnalytics(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Radical Red 4.1 Nuzlocke Tracker',
        short_name: 'RR Nuzlocke',
        description:
          'Route encounters, boss teams, level caps and run tracking for Pokémon Radical Red 4.1',
        theme_color: '#12151c',
        background_color: '#12151c',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            // its own file, not pwa-512 reused: a maskable icon is cropped to
            // a circle by the launcher, so the artwork has to sit inside the
            // central 80% safe zone with the corners filled. The plain icons
            // above are the squircle itself, which would lose its corners.
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // the bosses.json chunk is ~600KB — raise the per-file precache cap
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // default globPatterns only picks up js/css/html + the manifest's
        // own icons — add png so the nav icons precache at install time
        globPatterns: ['**/*.{js,css,html,ico,svg,png,webmanifest}'],
        // ...but NOT the sprite mirror. It's ~1800 files, and precaching
        // means the service worker must fetch every one of them before it
        // installs — turning a fast first load into a stall, to prefetch
        // art for 1200 species the player will never catch. They're served
        // from our own origin and cached on first view instead (below).
        globIgnores: ['**/sprites/**'],
        runtimeCaching: [
          {
            // our own mirrored sprites (public/sprites/{species,items,custom}).
            // StaleWhileRevalidate, not CacheFirst: these live in public/ so
            // their filenames never change between deploys, and a re-cleaned
            // sprite would otherwise be invisible to anyone who had already
            // cached the old one — for up to the 90 days below. Serving from
            // cache and refreshing in the background keeps it instant while
            // still letting a fix actually land.
            urlPattern: ({ url }: { url: URL }) => url.pathname.includes('/sprites/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sprites',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // kept as a safety net: anything the mirror missed still
            // resolves upstream exactly as it used to (Showdown, RR dex,
            // PokeAPI), so a gap degrades to the old behaviour rather than
            // to a broken image
            urlPattern:
              /^https:\/\/(play\.pokemonshowdown\.com|raw\.githubusercontent\.com)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sprites',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // served from the apex of radicalredtracker.com (public/CNAME), so the
  // site sits at the domain root rather than under /<repo-name>/
  base: '/',
  // rr-damage-calc is a linked local package of CommonJS bundles; force
  // pre-bundling so the dev server converts it to ESM
  optimizeDeps: {
    include: ['rr-damage-calc', 'rr-damage-calc/mechanics/util.js'],
  },
})
