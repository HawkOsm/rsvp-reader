import type { RawLine } from './types'

/**
 * Drop a running header/footer: a page's first or last line, if that exact
 * (page-number-normalised) line shows up on at least half the pages.
 * `pages` is one array of already-reading-ordered lines per page.
 */
export function dropRepeatedHeadersFooters(pages: RawLine[][]): RawLine[][] {
  if (pages.length < 3) return pages // not enough pages for the pattern to mean anything

  const firstCounts = new Map<string, number>()
  const lastCounts = new Map<string, number>()

  for (const page of pages) {
    if (page.length === 0) continue
    const first = normalize(lineText(page[0] as RawLine))
    const last = normalize(lineText(page[page.length - 1] as RawLine))
    if (first) firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1)
    if (last && last !== first) lastCounts.set(last, (lastCounts.get(last) ?? 0) + 1)
  }

  const threshold = Math.ceil(pages.length * 0.5)
  const repeatedFirsts = new Set(
    [...firstCounts].filter(([, count]) => count >= threshold).map(([key]) => key),
  )
  const repeatedLasts = new Set(
    [...lastCounts].filter(([, count]) => count >= threshold).map(([key]) => key),
  )
  if (repeatedFirsts.size === 0 && repeatedLasts.size === 0) return pages

  return pages.map((page) => {
    if (page.length === 0) return page
    const out = [...page]
    if (out.length > 0 && repeatedFirsts.has(normalize(lineText(out[0] as RawLine)))) {
      out.shift()
    }
    if (out.length > 0) {
      const lastIdx = out.length - 1
      if (repeatedLasts.has(normalize(lineText(out[lastIdx] as RawLine)))) out.pop()
    }
    return out
  })
}

function lineText(line: RawLine): string {
  return line.words.map((w) => w.text).join(' ')
}

/** Page numbers vary line to line, so digits are collapsed before comparing. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\d+/g, '#').trim()
}
