import type { RawLine, RawWord } from './types'

/** Fewer capitals than this in a row is just prose or a numeral ("I V X"). */
const MIN_LETTERS = 5

/** A gap this many times the typical gap between letters is a word break. */
const WORD_BREAK_FACTOR = 1.8

/** The usual gap between a heading's letters, at most this many letter widths. */
const MAX_GAP_IN_LETTERS = 1.5

const isCapital = (word: RawWord) => /^\p{Lu}$/u.test(word.text)
/** A chapter number left as it is: "C H A P T E R 12". */
const isNumber = (word: RawWord) => /^\d{1,4}$/.test(word.text)

/**
 * Join the letters of letter-spaced headings ("C H A P T E R  O N E") back
 * into words.
 *
 * The extractor sees each letter as a word of its own, which would flash
 * single letters one at a time. A line is treated as spaced-out text only
 * if it is made of single capital letters (five or more) and short numbers
 * and nothing else, so ordinary lines, table rows ("1 2 3 4 5"),
 * sums ("x = y + z") and bullets are left alone. Within it, the width of
 * the gaps decides where one word ends and the next begins: the spaces
 * inside a word are all alike, and the space between words is clearly wider.
 */
export function joinLetterSpacedLines(lines: RawLine[]): RawLine[] {
  return lines.map((line) => {
    const capitals = line.words.filter(isCapital).length
    if (capitals < MIN_LETTERS || !line.words.every((w) => isCapital(w) || isNumber(w))) {
      return line
    }
    const joined = joinLetters(line.words)
    return joined === line.words ? line : { ...line, words: joined }
  })
}

function joinLetters(words: RawWord[]): RawWord[] {
  const gaps: number[] = []
  const widths = words.filter(isCapital).map((w) => w.bbox[2] - w.bbox[0])
  words.forEach((word, i) => {
    const next = words[i + 1]
    if (next && isCapital(word) && isCapital(next)) gaps.push(next.bbox[0] - word.bbox[2])
  })
  const typical = median(gaps)
  // Headings are tracked out a little (a gap about a letter wide at most). A
  // row of capitals with big gaps between them is a table header or labels.
  if (typical > median(widths) * MAX_GAP_IN_LETTERS) return words
  // A word gap is measured against the usual gap, but a font with no
  // spacing at all (median ~0) still needs *some* floor to break on.
  const threshold = Math.max(typical * WORD_BREAK_FACTOR, typical + 1)

  const out: RawWord[] = []
  let run: RawWord[] = []
  const flush = () => {
    if (run.length > 0) out.push(merge(run))
    run = []
  }
  words.forEach((word, i) => {
    if (!isCapital(word)) {
      flush()
      out.push(word)
      return
    }
    const previous = words[i - 1]
    if (previous && isCapital(previous) && word.bbox[0] - previous.bbox[2] > threshold) flush()
    run.push(word)
  })
  flush()
  return out
}

function merge(letters: RawWord[]): RawWord {
  const first = letters[0] as RawWord
  return {
    text: letters.map((letter) => letter.text).join(''),
    page: first.page,
    bbox: [
      Math.min(...letters.map((l) => l.bbox[0])),
      Math.min(...letters.map((l) => l.bbox[1])),
      Math.max(...letters.map((l) => l.bbox[2])),
      Math.max(...letters.map((l) => l.bbox[3])),
    ],
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}
