import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

// The OCR files are served at fixed URLs, so the cache they are kept in is
// named for the version of Tesseract they came from: an upgrade starts a
// fresh cache instead of mixing a new library with an old engine.
const tesseractVersion = (
  JSON.parse(
    readFileSync(createRequire(import.meta.url).resolve('tesseract.js/package.json'), 'utf8'),
  ) as { version: string }
).version

// https://vite.dev/config/
export default defineConfig({
  // Must match `devUrl` in src-tauri/tauri.conf.json, or `pnpm tauri dev`
  // waits forever on a port nothing is listening on.
  server: { port: 5180, strictPort: true },
  // `@/x` is `src/x` — mirrors `paths` in tsconfig.app.json.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
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
        // The app shell (HTML/CSS/JS, including the workers) precaches so
        // the app opens with no network. That includes MuPDF's ~10 MB
        // WebAssembly module: without it a PDF would not open offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        // OCR's engine and language data (about 13 MB in public/ocr, put there
        // by scripts/copy-ocr-assets.mjs; a reader fetches 7-9 MB of it) is not
        // part of the app shell: it is fetched, and then cached, the first
        // time a language is used, so installing the app does not pay for it.
        // That means OCR works offline only for languages used before.
        globIgnores: ['ocr/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: `ocr-assets-tesseract-${tesseractVersion}` },
          },
        ],
        // Runtime data (books, tokens, settings) lives in IndexedDB, never
        // matched by a network route here — nothing to cache or go stale.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  // MuPDF awaits its WebAssembly at the top level, which a classic
  // (single-script) worker cannot contain; module workers can.
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'], // e2e/ is Playwright's
    testTimeout: 15_000, // EPUB parsing is slow when the whole suite runs at once
  },
})
