import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DARK_PALETTE, resolvePalette, type Palette } from '@/lib/theme'

// The palette is written twice: as CSS variables (src/index.css, which the
// page needs before any script runs) and in theme.ts (the canvas draws with
// plain colours). This keeps the copies from drifting apart.

const css = readFileSync('src/index.css', 'utf8')

/** The --color-* variables declared in the CSS block that starts at `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  expect(start, `no block for ${selector}`).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/--color-([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  )
}

/** The palette as CSS variable names: bgRaised -> bg-raised. */
const asCss = (palette: Palette) =>
  Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [
      key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
      value,
    ]),
  )

describe('the palette in index.css matches theme.ts', () => {
  it('dark', () => {
    expect(block(":root[data-theme='dark']")).toEqual(asCss(DARK_PALETTE))
  })
  it('light, chosen in settings', () => {
    expect(block(":root[data-theme='light']")).toEqual(asCss(resolvePalette('light')))
  })
  it('paper', () => {
    expect(block(":root[data-theme='paper']")).toEqual(asCss(resolvePalette('paper')))
  })
  it('light, following the system', () => {
    expect(block(':root:not([data-theme])')).toEqual(asCss(resolvePalette('light')))
  })
})
