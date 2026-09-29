import { codePoints, isAlnum } from './unicode'
import { core } from './pacing'

// Ported from rsvp_engine.py's orp_index() — keep the two in sync.

/**
 * Index (in codepoints) of the Optimal Recognition Point letter within
 * `word`. Standard heuristic on the *letters* of the word (leading quotes
 * and brackets are skipped): 1 letter -> the 1st, 2-5 -> the 2nd, 6-9 -> the
 * 3rd, 10-13 -> the 4th, longer -> the 5th.
 *
 * Operates on codepoints, like Python's `len()`/indexing does, so a
 * Turkish "ı" or "ğ" counts as one letter each — no grapheme clustering
 * (Intl.Segmenter) needed, since Python's engine doesn't do that either
 * and this keeps the two in exact parity. See DECISIONS.md.
 */
export function orpIndex(word: string): number {
  if (word.length === 0) return 0
  const cps = codePoints(word)
  let start = 0
  while (start < cps.length - 1 && !isAlnum(cps[start] as string)) start++
  const rest = cps.slice(start).join('')
  const coreText = core(rest) || rest
  const n = codePoints(coreText).length
  let offset: number
  if (n <= 1) offset = 0
  else if (n <= 5) offset = 1
  else if (n <= 9) offset = 2
  else if (n <= 13) offset = 3
  else offset = 4
  return Math.min(start + offset, cps.length - 1)
}
