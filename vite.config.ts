import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /<repo-name>/
  base: '/radical-red-tracker/',
  // rr-damage-calc is a linked local package of CommonJS bundles; force
  // pre-bundling so the dev server converts it to ESM
  optimizeDeps: { include: ['rr-damage-calc'] },
})
