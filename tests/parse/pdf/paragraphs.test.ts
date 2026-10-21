import { describe, expect, it } from 'vitest'
import { markParagraphBreaks } from '../../../src/parse/pdf/paragraphs'
import type { RawLine } from '../../../src/parse/pdf/types'

function line(page: number, block: number): RawLine {
  return { page, block, words: [{ text: 'w', page, bbox: [0, 0, 10, 10] }] }
}

describe('markParagraphBreaks', () => {
  it('does not break between lines of one block', () => {
    const lines = [line(0, 0), line(0, 0), line(0, 0)]
    expect(markParagraphBreaks(lines)).toEqual([false, false, true]) // last line: end of doc
  })

  it('breaks where the block changes', () => {
    const lines = [line(0, 0), line(0, 0), line(0, 1), line(0, 1)]
    expect(markParagraphBreaks(lines)).toEqual([false, true, false, true])
  })

  it('breaks on a page turn even if the block number repeats', () => {
    const lines = [line(0, 0), line(0, 0), line(1, 0), line(1, 0)]
    expect(markParagraphBreaks(lines)).toEqual([false, true, false, true])
  })

  it('handles an empty input', () => {
    expect(markParagraphBreaks([])).toEqual([])
  })

  it('marks a single line as a break (it is both start and end)', () => {
    expect(markParagraphBreaks([line(0, 0)])).toEqual([true])
  })
})
