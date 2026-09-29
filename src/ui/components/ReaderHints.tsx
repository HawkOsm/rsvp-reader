import type { ReadingMode } from '../store'

/** [keys, what they do] — each key is drawn as its own keycap. */
type Hint = [keys: string[], label: string]

const RSVP: Hint[] = [
  [['space'], 'play / pause'],
  [['←', '→'], 'back / forward a word'],
  [['shift', '← →'], 'ten words'],
  [['↑', '↓'], 'speed'],
  [['b'], 'book mode'],
  [['p'], 'page view'],
  [['esc'], 'library'],
]

const BOOK_PDF: Hint[] = [
  [['space', '→'], 'next'],
  [['←'], 'back'],
  [['pgup', 'pgdn'], 'turn the page'],
  [['+', '−'], 'page size'],
  [['d'], 'one or two pages'],
  [['f'], 'fit page / width'],
  [['b'], 'back to RSVP'],
  [['esc'], 'library'],
]

// Book mode over reflowed text has no pages to turn, size or fit.
const BOOK_TEXT: Hint[] = [
  [['space', '→'], 'next word'],
  [['←'], 'back a word'],
  [['b'], 'back to RSVP'],
  [['esc'], 'library'],
]

export interface ReaderHintsProps {
  mode: ReadingMode
  /** The book has real pages (a PDF). */
  paged: boolean
}

/** The keyboard cheat-sheet under the controls. Hidden on touch screens,
 * where none of these keys exist. */
export function ReaderHints({ mode, paged }: ReaderHintsProps) {
  const hints = mode === 'rsvp' ? RSVP : paged ? BOOK_PDF : BOOK_TEXT
  return (
    <ul className="hidden flex-wrap justify-center gap-x-5 gap-y-1.5 px-4 pb-3 text-xs text-[var(--color-text-dim)] md:flex">
      {hints.map(([keys, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className="flex gap-1">
            {keys.map((key) => (
              <kbd
                key={key}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-1.5 py-0.5 font-sans text-[var(--color-text)]"
              >
                {key}
              </kbd>
            ))}
          </span>
          {label}
        </li>
      ))}
    </ul>
  )
}
