import { MAX_WPM, MIN_WPM } from '@/core/pacing'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '@/lib/fonts'
import type { ThemeMode } from '@/lib/theme'

export const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'paper', label: 'Paper' },
]

/** One press of a word-size button, in px. Matches the reader's Aa panel. */
export const SIZE_STEP = 4
/** One press of a speed button. Matches the reader's ↑/↓ and − / +. */
export const WPM_STEP = 25

export function stepSize(size: number, direction: 1 | -1): number {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size + direction * SIZE_STEP))
}

export function stepWpm(wpm: number, direction: 1 | -1): number {
  return Math.max(MIN_WPM, Math.min(MAX_WPM, wpm + direction * WPM_STEP))
}

/** Where a word size sits between the smallest and largest, 0–100. */
export function sizePercent(size: number): number {
  return ((size - MIN_FONT_SIZE) / (MAX_FONT_SIZE - MIN_FONT_SIZE)) * 100
}
