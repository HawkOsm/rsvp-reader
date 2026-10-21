// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExtractionError } from '../../src/parse/errors'
import { parsePdf } from '../../src/parse/pdf'

function fileFrom(path: string, name: string): File {
  return new File([readFileSync(path)], name, { type: 'application/pdf' })
}

const FIXTURES = 'tests/fixtures'

describe('parsePdf', () => {
  it('extracts the hyphenated fixture with hyphens rejoined and a sane title', async () => {
    const result = await parsePdf(fileFrom(`${FIXTURES}/hyphenated-line-breaks.pdf`, 'h.pdf'))

    expect(result.title).toBe('Hyphenated Line Breaks')
    expect(result.layout).toEqual({ kind: 'paged', pages: 1, boxSpace: 'displayed' })
    // "self-\nsame" and "half-\nremembered" both rejoin without a hyphen —
    // the next word starts lowercase, so the heuristic (shared with
    // rsvp_engine.py's tokenize_pdf) reads them as line-break artifacts,
    // not real compounds. That's the heuristic's known limitation, not a
    // bug: see DECISIONS.md.
    expect(result.tokens.map((t) => t.text)).toEqual([
      'It',
      'was',
      'a',
      'night',
      'of',
      'extraordinary',
      'stillness,',
      'and',
      'Mr.',
      'Utterson',
      'found',
      'himself',
      'unable',
      'to',
      'understand',
      'the',
      'strange',
      'circumstances',
      'that',
      'had',
      'brought',
      'him',
      'to',
      'the',
      'door',
      'of',
      'his',
      'old',
      "friend's",
      'laboratory',
      'once',
      'again.',
      'The',
      'selfsame',
      'feeling',
      'of',
      'dread,',
      'halfremembered',
      'from',
      'his',
      'student',
      'days,',
      'crept',
      'over',
      'him',
      'as',
      'he',
      'reached',
      'for',
      'the',
      'tarnished',
      'knocker',
      'and',
      'let',
      'it',
      'fall.',
    ])
    expect(result.tokens.every((t) => t.page === 0)).toBe(true)
    expect(result.tokens.every((t) => t.bbox !== null)).toBe(true)
    expect(result.tokens[result.tokens.length - 1]?.paraEnd).toBe(true)
  })

  it('reads a two-column page in column order, not interleaved by y', async () => {
    const result = await parsePdf(fileFrom(`${FIXTURES}/two-column-text.pdf`, 't.pdf'))

    expect(result.title).toBe('Two-Column Excerpt')
    expect(result.tokens.length).toBe(2200)
    expect(result.tokens.slice(0, 8).map((t) => t.text)).toEqual([
      'The',
      'Strange',
      'Case',
      'Of',
      'Dr.',
      'Jekyll',
      'And',
      'Mr.',
    ])
    // No line ever reads as a jump back to column 1's y after column 2 has
    // started, i.e. the whole thing is one continuous, non-interleaved run.
    const first200 = result.tokens.slice(0, 200).map((t) => t.text)
    expect(first200.join(' ')).not.toMatch(/\bContents\b.*\bContents\b/)
  })

  it('rejects a PDF with no real text layer (a scan) with a clear message', async () => {
    await expect(
      parsePdf(fileFrom(`${FIXTURES}/scanned-blank.pdf`, 'scan.pdf')),
    ).rejects.toThrow(ExtractionError)
    await expect(
      parsePdf(fileFrom(`${FIXTURES}/scanned-blank.pdf`, 'scan.pdf')),
    ).rejects.toThrow(/no text layer/i)
  })

  it('rejects a password-protected PDF with a clear message', async () => {
    await expect(
      parsePdf(fileFrom(`${FIXTURES}/password-protected.pdf`, 'locked.pdf')),
    ).rejects.toThrow(ExtractionError)
    await expect(
      parsePdf(fileFrom(`${FIXTURES}/password-protected.pdf`, 'locked.pdf')),
    ).rejects.toThrow(/password protected/i)
  })

  it('reports progress once per page', async () => {
    const fractions: number[] = []
    await parsePdf(fileFrom(`${FIXTURES}/two-column-text.pdf`, 't.pdf'), {
      onProgress: (p) => fractions.push(p.fraction),
    })
    expect(fractions.length).toBeGreaterThan(0)
    expect(fractions[fractions.length - 1]).toBe(1)
    expect(fractions.every((f) => f > 0 && f <= 1)).toBe(true)
  })

  it('can be cancelled via AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      parsePdf(fileFrom(`${FIXTURES}/two-column-text.pdf`, 't.pdf'), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('stops part-way when cancelled during the read', async () => {
    const controller = new AbortController()
    await expect(
      parsePdf(fileFrom(`${FIXTURES}/two-column-text.pdf`, 't.pdf'), {
        signal: controller.signal,
        // Cancel as soon as the first of three pages is done.
        onProgress: (p) => p.fraction < 1 && controller.abort(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reads a letter-spaced chapter heading as words, but leaves a row of numbers alone', async () => {
    const result = await parsePdf(fileFrom(`${FIXTURES}/spaced-heading.pdf`, 's.pdf'))
    const words = result.tokens.map((t) => t.text)
    expect(words.slice(0, 2)).toEqual(['CHAPTER', 'ONE'])
    expect(words.slice(2, 7)).toEqual(['1', '2', '3', '4', '5'])
    expect(words.slice(7, 10)).toEqual(['It', 'was', 'the'])
  })

  it('stores word boxes on the page as displayed when the page is rotated', async () => {
    const result = await parsePdf(fileFrom(`${FIXTURES}/rotated-page.pdf`, 'r.pdf'))
    expect(result.tokens.slice(0, 5).map((t) => t.text)).toEqual(['The', 'quick', 'brown', 'fox', 'jumps'])
    // The page is 612x792 turned on its side, so it is displayed 792 wide and 612 tall.
    for (const token of result.tokens) {
      const [x0, y0, x1, y1] = token.bbox as [number, number, number, number]
      expect(x0).toBeGreaterThanOrEqual(0)
      expect(x1).toBeLessThanOrEqual(792)
      expect(y0).toBeGreaterThanOrEqual(0)
      expect(y1).toBeLessThanOrEqual(612)
      expect(x1).toBeGreaterThan(x0)
      expect(y1).toBeGreaterThan(y0)
    }
    expect(result.layout).toMatchObject({ kind: 'paged', boxSpace: 'displayed' })
  })
})
