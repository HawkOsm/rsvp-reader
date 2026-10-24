import { describe, expect, it } from 'vitest'
import { flattenPdfWords } from '@/parse/pdf/flatten'
import type { RawLine, RawWord } from '@/parse/pdf/types'

function word(text: string, page = 0): RawWord {
  return { text, page, bbox: [0, 0, 10, 10] }
}

function line(page: number, words: string[]): RawLine {
  return { page, block: 0, words: words.map((w) => word(w, page)) }
}

describe('flattenPdfWords', () => {
  it('rejoins a hyphenated word across a line break, dropping the hyphen', () => {
    const lines = [line(0, ['extraor-']), line(0, ['dinary', 'stillness.'])]
    const tokens = flattenPdfWords(lines, [false, true])
    expect(tokens.map((t) => t.text)).toEqual(['extraordinary', 'stillness.'])
  })

  it('rejoins when the next word starts with a non-ASCII lowercase letter', () => {
    const lines = [line(0, ['kitap-']), line(0, ['çılar.'])]
    const tokens = flattenPdfWords(lines, [false, true])
    expect(tokens.map((t) => t.text)).toEqual(['kitapçılar.'])
  })

  it('keeps the paragraph pause when the last line is only the tail of a hyphenated word', () => {
    // "... infor-" / "mation." closes the paragraph, as the original reader did.
    const lines = [line(0, ['Some', 'infor-']), line(0, ['mation.'])]
    const tokens = flattenPdfWords(lines, [false, true])
    expect(tokens.map((t) => [t.text, t.paraEnd])).toEqual([
      ['Some', false],
      ['information.', true],
    ])
  })

  it('does not add a pause when the tail is mid-paragraph', () => {
    const lines = [line(0, ['infor-']), line(0, ['mation', 'goes', 'on.'])]
    const tokens = flattenPdfWords(lines, [false, true])
    expect(tokens.map((t) => [t.text, t.paraEnd])).toEqual([
      ['information', false],
      ['goes', false],
      ['on.', true],
    ])
  })

  it('keeps the hyphen when the next word starts uppercase (a real hyphen, not a line break)', () => {
    const lines = [line(0, ['Anglo-']), line(0, ['Saxon', 'history.'])]
    const tokens = flattenPdfWords(lines, [false, true])
    expect(tokens.map((t) => t.text)).toEqual(['Anglo-Saxon', 'history.'])
  })

  it('rejoins across a page boundary too', () => {
    const lines = [line(0, ['under-']), line(1, ['stand.'])]
    const tokens = flattenPdfWords(lines, [false, true])
    expect(tokens.map((t) => t.text)).toEqual(['understand.'])
    expect(tokens[0]?.page).toBe(0) // anchored where the word started
  })

  it('resolves a trailing hyphen with nothing after it as its own word', () => {
    const lines = [line(0, ['word-'])]
    const tokens = flattenPdfWords(lines, [true])
    expect(tokens.map((t) => t.text)).toEqual(['word'])
  })

  it('does not treat a single hyphen character as a fragment', () => {
    const lines = [line(0, ['-']), line(0, ['word'])]
    const tokens = flattenPdfWords(lines, [false, true])
    expect(tokens.map((t) => t.text)).toEqual(['-', 'word'])
  })

  it('marks paraEnd on the last word of a paragraph-ending line', () => {
    const lines = [line(0, ['One', 'two.']), line(0, ['Three', 'four.'])]
    const tokens = flattenPdfWords(lines, [true, true])
    expect(tokens.map((t) => [t.text, t.paraEnd])).toEqual([
      ['One', false],
      ['two.', true],
      ['Three', false],
      ['four.', true],
    ])
  })

  it('carries paraEnd onto the resolved word when the paragraph ends on a hyphen fragment', () => {
    const lines = [line(0, ['One', 'extraor-']), line(0, ['dinary.'])]
    const tokens = flattenPdfWords(lines, [true, true])
    expect(tokens.map((t) => [t.text, t.paraEnd])).toEqual([
      ['One', false],
      ['extraordinary.', true],
    ])
  })
})
