import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
            src: 'pwa-512.png',
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
  // GitHub Pages serves the site under /<repo-name>/
  base: '/radical-red-tracker/',
  // rr-damage-calc is a linked local package of CommonJS bundles; force
  // pre-bundling so the dev server converts it to ESM
  optimizeDeps: {
    include: ['rr-damage-calc', 'rr-damage-calc/mechanics/util.js'],
  },
})
