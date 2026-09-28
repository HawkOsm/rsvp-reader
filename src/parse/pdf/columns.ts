import type { RawLine } from './types'

/**
 * Order a page's lines for reading: left column top-to-bottom, then the
 * next column top-to-bottom, and so on — rather than raw top-to-bottom
 * across the whole page width, which interleaves columns.
 *
 * Column boundaries are found by single-linkage clustering each line's
 * left edge (`x0`): a new column starts wherever the gap to the next
 * distinct `x0` exceeds a threshold scaled to the page width. This is a
 * heuristic, not real layout analysis — it works for the common case (a
 * handful of clearly-separated columns, each line starting at roughly the
 * same x) and can be fooled by heavily indented or ragged layouts. Good
 * enough for a reader; see DECISIONS.md.
 */
export function sortReadingOrder(lines: RawLine[], pageWidth: number): RawLine[] {
  if (lines.length === 0) return []

  const threshold = Math.max(20, pageWidth * 0.08)
  const sortedX0 = [...new Set(lines.map((l) => l.x0))].sort((a, b) => a - b)

  const clusterStarts: number[] = []
  let clusterTail = -Infinity
  for (const x of sortedX0) {
    if (x - clusterTail > threshold) clusterStarts.push(x)
    clusterTail = x
  }

  function columnIndex(x0: number): number {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < clusterStarts.length; i++) {
      const d = Math.abs(x0 - (clusterStarts[i] as number))
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    return best
  }

  return [...lines].sort((a, b) => {
    const ca = columnIndex(a.x0)
    const cb = columnIndex(b.x0)
    if (ca !== cb) return ca - cb
    // Top-to-bottom within a column: PDF y increases upward, so descending y.
    if (a.y !== b.y) return b.y - a.y
    return a.x0 - b.x0
  })
}
