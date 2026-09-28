import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': a new version must never
      // silently reload mid-read (README/plan requirement) — the app
      // itself asks the reader before swapping the service worker.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'RSVP Reader',
        short_name: 'RSVP',
        description: 'A local speed reader. Words one at a time, at a pace you set.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#16181d',
        theme_color: '#16181d',
        categories: ['books', 'productivity', 'education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app shell (HTML/CSS/JS, including the parse.worker chunk
        // that bundles pdf.js/JSZip) precaches so the app opens with no
        // network. pdf.js's own standard-fonts data isn't precached yet —
        // only matters for non-embedded-font PDFs, and pdf.js already
        // degrades to reasonable default metrics without it (see
        // DECISIONS.md, Phase 3).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Runtime data (books, tokens, settings) lives in IndexedDB, never
        // matched by a network route here — nothing to cache or go stale.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
})
