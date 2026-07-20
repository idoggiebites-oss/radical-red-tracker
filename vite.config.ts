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
        runtimeCaching: [
          {
            // sprites (Showdown, RR dex + PokeAPI on githubusercontent)
            urlPattern:
              /^https:\/\/(play\.pokemonshowdown\.com|raw\.githubusercontent\.com)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sprites',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 },
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
