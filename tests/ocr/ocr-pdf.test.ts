import { describe, expect, it, vi } from 'vitest'
import { ExtractionError } from '@/parse/errors'
import {
  extractByOcr,
  OCR_RENDER_SCALE,
  raceAbort,
  type PageRecognizer,
  type PageRenderer,
} from '@/ocr/ocr-pdf'
import type { PageLine, RenderedPage } from '@/pdf/document'

const HEIGHT = 800

function renderer(pageCount: number): PageRenderer & { renders: [number, number][] } {
  const renders: [number, number][] = []
  return {
    pageCount,
    renders,
    pageSize: async () => ({ width: 600, height: HEIGHT, userToPage: [1, 0, 0, 1, 0, 0] }),
    render: async (page, scale) => {
      renders.push([page, scale])
      return { width: 1, height: 1, scale, rgba: new Uint8ClampedArray(4) } satisfies RenderedPage
    },
  }
}

/** Recognises page N as the lines given for it, top-left in page points. */
function recognizer(pages: PageLine[][]): PageRecognizer {
  let next = 0
  return { recognize: async () => pages[next++] ?? [] }
}

const line = (block: number, ...words: string[]): PageLine => ({
  block,
  baseline: 112,
  words: words.map((text, i) => ({ text, x0: 72 + i * 50, y0: 100, x1: 112 + i * 50, y1: 112 })),
})

describe('extractByOcr', () => {
  it('reads every page at the OCR scale and joins them into one book', async () => {
    const pdf = renderer(2)
    const result = await extractByOcr(
      pdf,
      recognizer([[line(0, 'First', 'page.')], [line(0, 'Second', 'page.')]]),
      'scan.pdf',
    )
    expect(pdf.renders).toEqual([
      [0, OCR_RENDER_SCALE],
      [1, OCR_RENDER_SCALE],
    ])
    expect(result.tokens.map((t) => [t.text, t.page])).toEqual([
      ['First', 0],
      ['page.', 0],
      ['Second', 1],
      ['page.', 1],
    ])
    expect(result).toMatchObject({
      formatId: 'pdf',
      layout: { kind: 'paged', pages: 2, boxSpace: 'displayed' }, // boxes are on the displayed page
      ocr: true,
      title: 'scan.pdf'.replace('.pdf', ''),
    })
  })

  it('puts each word box in the stored (y-up) convention', async () => {
    const result = await extractByOcr(renderer(1), recognizer([[line(0, 'Word')]]), 'a.pdf')
    // y 100..112 from the top of an 800pt page.
    expect(result.tokens[0]?.bbox).toEqual([72, HEIGHT - 112, 112, HEIGHT - 100])
  })

  it('ends a paragraph where the block changes, and at the end of each page', async () => {
    const result = await extractByOcr(
      renderer(2),
      recognizer([[line(0, 'a', 'b'), line(1, 'c')], [line(0, 'd')]]),
      'a.pdf',
    )
    expect(result.tokens.map((t) => [t.text, t.paraEnd])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
      ['d', true],
    ])
  })

  it('reports progress page by page, ending at 1', async () => {
    const seen: [number, string | undefined][] = []
    await extractByOcr(renderer(2), recognizer([[line(0, 'a')], [line(0, 'b')]]), 'a.pdf', {
      onProgress: (p) => seen.push([p.fraction, p.message]),
    })
    expect(seen.map(([f]) => f)).toEqual([0, 0.5, 1])
    expect(seen[0]?.[1]).toBe('Recognising page 1 of 2')
    expect(seen.at(-1)?.[1]).toBe('Done')
  })

  it('stops between pages when cancelled', async () => {
    const controller = new AbortController()
    const recognize = vi.fn(async () => {
      controller.abort() // cancelled while the first page is being read
      return [line(0, 'a')]
    })
    await expect(
      extractByOcr(renderer(3), { recognize }, 'a.pdf', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(recognize).toHaveBeenCalledTimes(1)
  })

  it('says so when nothing at all could be recognised', async () => {
    await expect(extractByOcr(renderer(2), recognizer([[], []]), 'blank.pdf')).rejects.toThrow(
      ExtractionError,
    )
    await expect(extractByOcr(renderer(1), recognizer([[]]), 'blank.pdf')).rejects.toThrow(
      /No text could be recognised/,
    )
  })

  it('drops a running header repeated on most pages, as it does for a text layer', async () => {
    const pages = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name) => [
      line(0, 'My', 'Book'),
      line(1, name, 'text.'),
    ])
    const result = await extractByOcr(renderer(4), recognizer(pages), 'a.pdf')
    expect(result.tokens.map((t) => t.text)).not.toContain('Book')
    expect(result.tokens).toHaveLength(8)
  })

  it('stops waiting for a page that is still being recognised when cancelled', async () => {
    const controller = new AbortController()
    const stuck: PageRecognizer = { recognize: () => new Promise(() => {}) } // never answers
    const reading = extractByOcr(renderer(2), stuck, 'a.pdf', { signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('raceAbort', () => {
  it('passes the result through when nothing aborts', async () => {
    await expect(raceAbort(Promise.resolve(7), new AbortController().signal)).resolves.toBe(7)
    await expect(raceAbort(Promise.resolve(7), undefined)).resolves.toBe(7)
  })

  it('passes a rejection through', async () => {
    await expect(
      raceAbort(Promise.reject(new Error('nope')), new AbortController().signal),
    ).rejects.toThrow('nope')
  })

  it('rejects at once if already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(raceAbort(new Promise(() => {}), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('does not complain when the abandoned work fails later', async () => {
    const controller = new AbortController()
    let fail: (e: Error) => void = () => {}
    const slow = new Promise<never>((_, reject) => (fail = reject))
    const raced = raceAbort(slow, controller.signal)
    controller.abort()
    await expect(raced).rejects.toMatchObject({ name: 'AbortError' })
    fail(new Error('too late')) // would be an unhandled rejection if not handled
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
