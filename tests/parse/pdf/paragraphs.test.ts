import { describe, expect, it } from 'vitest'
import { markParagraphBreaks } from '../../../src/parse/pdf/paragraphs'
import type { RawLine } from '../../../src/parse/pdf/types'

function line(page: number, y: number, x0 = 72): RawLine {
  return { page, x0, y, words: [{ text: 'w', page, bbox: [x0, y, x0 + 10, y + 12] }] }
}

describe('markParagraphBreaks', () => {
  it('does not break between regularly-spaced lines of one paragraph', () => {
    const lines = [line(0, 700), line(0, 686), line(0, 672), line(0, 658)]
    expect(markParagraphBreaks(lines)).toEqual([false, false, false, true]) // last line: end of doc
  })

  it('breaks where the gap is noticeably bigger than the paragraph line height', () => {
    const lines = [
      line(0, 700),
      line(0, 686), // 14pt gap: normal
      line(0, 662), // 24pt gap: a paragraph break
      line(0, 648), // back to 14pt
    ]
    expect(markParagraphBreaks(lines)).toEqual([false, true, false, true])
  })

  it('always breaks on a page turn', () => {
    const lines = [line(0, 700), line(0, 686), line(1, 700), line(1, 686)]
    expect(markParagraphBreaks(lines)).toEqual([false, true, false, true])
  })

  it('always breaks on a column turn (y goes back up within the same page)', () => {
    // Column 1 ends, column 2 starts near the top again.
    const lines = [line(0, 700), line(0, 686), line(0, 700, 350), line(0, 686, 350)]
    expect(markParagraphBreaks(lines)).toEqual([false, true, false, true])
  })

  it('handles an empty input', () => {
    expect(markParagraphBreaks([])).toEqual([])
  })

  it('marks a single line as a break (it is both start and end)', () => {
    expect(markParagraphBreaks([line(0, 700)])).toEqual([true])
  })
})
