import { describe, expect, it } from 'vitest'
import { joinLetterSpacedLines } from '../../../src/parse/pdf/spaced'
import type { RawLine, RawWord } from '../../../src/parse/pdf/types'

/** Lay `text` out one character per word: letters `letterGap` apart, and
 * `wordGap` where the text has a space. A character that is a digit run
 * ("12") is one word. */
function spaced(text: string, letterGap = 3, wordGap = 12, charWidth = 8): RawLine {
  const words: RawWord[] = []
  let x = 100
  for (const piece of text.split(/(\s|\d+)/).filter((p) => p !== '')) {
    if (piece === ' ') {
      x += wordGap - letterGap
      continue
    }
    for (const ch of /^\d+$/.test(piece) ? [piece] : piece) {
      words.push({ text: ch, page: 0, bbox: [x, 700, x + charWidth, 712] })
      x += charWidth + letterGap
    }
  }
  return { page: 0, block: 0, words }
}

/** Letters at the given gaps, one after another. */
function withGaps(letters: string, gaps: number[]): RawLine {
  let x = 100
  const words = [...letters].map((text, i) => {
    const word: RawWord = { text, page: 0, bbox: [x, 700, x + 8, 712] }
    x += 8 + (gaps[i] ?? 0)
    return word
  })
  return { page: 0, block: 0, words }
}

const texts = (line: RawLine | undefined) => line?.words.map((w) => w.text)
const join = (line: RawLine) => joinLetterSpacedLines([line])[0]

describe('joinLetterSpacedLines: what it joins', () => {
  it('joins a letter-spaced heading into its words', () => {
    expect(texts(join(spaced('CHAPTER ONE')))).toEqual(['CHAPTER', 'ONE'])
  })

  it('joins a single spaced word', () => {
    expect(texts(join(spaced('PROLOGUE')))).toEqual(['PROLOGUE'])
  })

  it('splits several words', () => {
    expect(texts(join(spaced('THE LONG WAY HOME')))).toEqual(['THE', 'LONG', 'WAY', 'HOME'])
  })

  it('keeps a chapter number as its own word', () => {
    expect(texts(join(spaced('CHAPTER 12')))).toEqual(['CHAPTER', '12'])
  })

  it('gives a joined word one box covering all its letters', () => {
    const word = join(spaced('PARTS'))?.words[0]
    expect(word?.bbox).toEqual([100, 700, 100 + 5 * 8 + 4 * 3, 712])
  })

  it('works whatever the tracking is', () => {
    expect(texts(join(spaced('CHAPTER TWO', 10, 40)))).toEqual(['CHAPTER', 'TWO'])
    expect(texts(join(spaced('CHAPTER TWO', 0.5, 6)))).toEqual(['CHAPTER', 'TWO'])
  })
})

describe('joinLetterSpacedLines: where it draws the word break', () => {
  // letters 4 apart; "CHAPTERONE" with one wider gap after the 7th letter.
  const line = (breakGap: number) =>
    withGaps('CHAPTERONE', [4, 4, 4, 4, 4, 4, breakGap, 4, 4])

  it('splits at a gap clearly wider than the letter gaps', () => {
    expect(texts(join(line(8)))).toEqual(['CHAPTER', 'ONE'])
    expect(texts(join(line(7.5)))).toEqual(['CHAPTER', 'ONE']) // 1.9x
  })

  it('does not split on a gap only a little wider (uneven tracking)', () => {
    expect(texts(join(line(6.4)))).toEqual(['CHAPTERONE']) // 1.6x
    expect(texts(join(line(4)))).toEqual(['CHAPTERONE'])
  })

  it('copes with letter gaps that vary a little', () => {
    const jittery = withGaps('CHAPTERONE', [3.6, 4.4, 4, 3.8, 4.2, 4, 9, 4.3, 3.7])
    expect(texts(join(jittery))).toEqual(['CHAPTER', 'ONE'])
  })

  it('does not split on sub-point jitter when the letters are almost touching', () => {
    // typical gap 0.3pt, one 0.9pt: three times as wide, but invisible
    expect(texts(join(withGaps('CHAPTERONE', [0.3, 0.3, 0.9, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3])))).toEqual([
      'CHAPTERONE',
    ])
  })

  it('still splits when the letters touch (no tracking at all)', () => {
    expect(texts(join(withGaps('CHAPTERONE', [0, 0, 0, 0, 0, 0, 6, 0, 0])))).toEqual([
      'CHAPTER',
      'ONE',
    ])
  })
})

describe('joinLetterSpacedLines: what it leaves alone', () => {
  const untouched = (text: string) => {
    const line = spaced(text)
    expect(join(line)).toBe(line)
  }

  it('table rows of numbers', () => untouched('1 2 3 4 5'))
  it('lowercase letters', () => untouched('a b c d e'))
  it('sums', () => untouched('x = y + z'))
  it('a short run of capitals (roman numerals)', () => untouched('I V X L'))
  it('bullets', () => untouched('• • • • •'))

  it('ordinary lines', () => {
    const line: RawLine = {
      page: 0,
      block: 0,
      words: ['I', 'am', 'a', 'person'].map((text, i) => ({
        text,
        page: 0,
        bbox: [i * 30, 0, i * 30 + 20, 10],
      })),
    }
    expect(join(line)).toBe(line)
  })

  it('a row of capitals with wide gaps, such as table headings', () => {
    const line = spaced('A B C D E', 20, 40, 6) // gaps over three letter widths
    expect(join(line)).toBe(line)
  })

  it('a line with even one real word in it', () => {
    const line = spaced('C H A P T E R')
    const mixed: RawLine = {
      ...line,
      words: [...line.words, { text: 'one', page: 0, bbox: [400, 700, 430, 712] }],
    }
    expect(join(mixed)).toBe(mixed)
  })
})

describe('joinLetterSpacedLines: around it', () => {
  it('keeps page and block, and handles each line separately', () => {
    const a = { ...spaced('PARTS ONE'), page: 3, block: 2 }
    const b: RawLine = { page: 3, block: 3, words: [{ text: 'Text.', page: 3, bbox: [0, 0, 30, 10] }] }
    const [first, second] = joinLetterSpacedLines([a, b])
    expect(first).toMatchObject({ page: 3, block: 2 })
    expect(texts(first)).toEqual(['PARTS', 'ONE'])
    expect(second).toBe(b)
  })

  it('handles no lines', () => {
    expect(joinLetterSpacedLines([])).toEqual([])
  })
})
