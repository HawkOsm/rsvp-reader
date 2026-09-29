#!/usr/bin/env node
// Fails CI if the web build's initial-load JS/CSS grows past a budget.
// Run after `pnpm build`. The parse.worker chunk (pdf.js + JSZip, lazy
// loaded only once a PDF/EPUB is actually opened) is checked separately
// with its own, much larger budget — it's not part of the initial page
// load, so it shouldn't be held to the same number.

import { readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST_ASSETS = 'dist/assets'

// Gzip sizes, in KB — generous headroom over what the app actually ships
// today (checked into DECISIONS.md's Phase 9 log), so this catches a real
// regression (an accidentally-bundled heavy dependency) rather than
// nagging on every small increment.
const BUDGETS_KB = {
  mainBundle: 400, // the entry JS chunk (react-router, zustand, dexie, app code)
  css: 30,
  worker: 700, // parse.worker: pdf.js + JSZip, lazy-loaded
}

function gzipKb(path) {
  const bytes = readFileSync(path)
  return gzipSync(bytes).length / 1024
}

function main() {
  let files
  try {
    files = readdirSync(DIST_ASSETS)
  } catch {
    console.error(`error: ${DIST_ASSETS} not found — run \`pnpm build\` first`)
    process.exit(1)
  }

  const jsFiles = files.filter((f) => f.endsWith('.js') && !f.includes('workbox-window'))
  const cssFiles = files.filter((f) => f.endsWith('.css'))

  const workerFile = jsFiles.find((f) => f.startsWith('parse.worker'))
  const mainFile = jsFiles
    .filter((f) => f !== workerFile)
    .map((f) => ({ f, size: statSync(join(DIST_ASSETS, f)).size }))
    .sort((a, b) => b.size - a.size)[0]?.f

  const checks = []
  if (mainFile) {
    checks.push(['mainBundle', mainFile, gzipKb(join(DIST_ASSETS, mainFile))])
  }
  if (workerFile) {
    checks.push(['worker', workerFile, gzipKb(join(DIST_ASSETS, workerFile))])
  }
  const totalCssKb = cssFiles.reduce((sum, f) => sum + gzipKb(join(DIST_ASSETS, f)), 0)
  checks.push(['css', cssFiles.join(', ') || '(none)', totalCssKb])

  let failed = false
  for (const [key, label, kb] of checks) {
    const budget = BUDGETS_KB[key]
    const over = kb > budget
    failed ||= over
    const status = over ? 'FAIL' : 'ok'
    console.log(`[${status}] ${key} (${label}): ${kb.toFixed(1)} KB gzip (budget ${budget} KB)`)
  }

  if (failed) {
    console.error('\nBundle size budget exceeded — see tools/check-bundle-size.mjs')
    process.exit(1)
  }
}

main()
