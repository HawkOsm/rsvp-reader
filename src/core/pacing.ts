import type { Token } from './types'
import { codePoints, rstripChars, stripChars } from './unicode'

// Ported from rsvp_engine.py — keep the two in sync.

/** Words longer than this get extra time, per character over the limit. */
const LONG_WORD_THRESHOLD = 6
const MS_PER_EXTRA_CHAR = 30.0

/** Multipliers applied for the punctuation a word ends on. */
const SHORT_PAUSE_MULT = 1.5 // , ; : — and friends
const LONG_PAUSE_MULT = 2.5 // . ! ? …

/** Flat extra pause at the end of a paragraph, on top of everything else. */
const PARAGRAPH_PAUSE_MS = 350.0

const MIN_DELAY_MS = 20.0

export const MIN_WPM = 50
export const MAX_WPM = 1500
export const DEFAULT_WPM = 300

const SHORT_PAUSE_CHARS = new Set([',', ';', ':', '\u2014', '\u2013'])
const LONG_PAUSE_CHARS = new Set(['.', '!', '?', '\u2026'])

/** Trailing characters that wrap real punctuation and should be looked past. */
const CLOSERS = '"\'\u2019\u201d\u00bb)]}*_'

const CORE_STRIP =
  '"\'\u2018\u2019\u201c\u201d\u00ab\u00bb()[]{}.,;:!?\u2026\u2014\u2013-*_'

/** The word without surrounding punctuation/quotes. */
export function core(word: string): string {
  return stripChars(word, CORE_STRIP)
}

/** How much longer to hold a word, based on what it ends with. */
function punctuationMultiplier(word: string): number {
  const trimmed = rstripChars(word, CLOSERS)
  if (trimmed.length === 0) return 1.0
  const cps = codePoints(trimmed)
  const last = cps[cps.length - 1] as string
  if (LONG_PAUSE_CHARS.has(last)) return LONG_PAUSE_MULT
  if (SHORT_PAUSE_CHARS.has(last)) return SHORT_PAUSE_MULT
  return 1.0
}

/** Milliseconds to hold `token` on screen at `wpm`. */
export function delayFor(token: Token, wpm: number): number {
  const base0 = 60000.0 / Math.max(1, wpm)
  const coreText = core(token.text)
  const length = coreText.length > 0 ? codePoints(coreText).length : codePoints(token.text).length
  const base = base0 + MS_PER_EXTRA_CHAR * Math.max(0, length - LONG_WORD_THRESHOLD)
  let delay = base * punctuationMultiplier(token.text)
  if (token.paraEnd) delay += PARAGRAPH_PAUSE_MS
  return Math.max(MIN_DELAY_MS, delay)
}
