import { DEFAULT_PAGE, makePageSpec } from '@/core/page-spec'
import { wordToTokenBox } from '@/pdf/geometry'
import type { PageLine, PageSize, RenderedPage } from '@/pdf/document'
import { ExtractionError } from '@/parse/errors'
import { linesToTokens } from '@/parse/pdf/extract'
import type { RawLine } from '@/parse/pdf/types'
import { chooseTitle } from '@/parse/title'
import type { ParseOptions, ParseResult } from '@/parse/types'

/** Pixels per PDF point to draw pages at for recognition: 3 is about
 * 216 dpi, close enough to the 300 Tesseract likes without the memory and
 * time of actually going there on a phone. */
export const OCR_RENDER_SCALE = 3

/** What OCR needs of an open PDF (a `PdfHandle` satisfies this). */
export interface PageRenderer {
  readonly pageCount: number
  pageSize(page: number): Promise<PageSize>
  render(page: number, scale: number): Promise<RenderedPage>
}

/** Reads the words off one drawn page. The boxes it returns are in PDF
 * points (divide pixels by `image.scale`), the same as a text layer's. */
export interface PageRecognizer {
  recognize(image: RenderedPage): Promise<PageLine[]>
}

/** `promise`, unless `signal` aborts first. The work behind it is not
 * stopped (the caller stops it by shutting the recogniser down), but the
 * caller no longer waits for it. */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Parsing cancelled', 'AbortError'))
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/**
 * Read a PDF with no text layer by drawing each page and recognising it.
 * Slow (seconds a page), which is why the caller asks the reader first.
 */
export async function extractByOcr(
  pdf: PageRenderer,
  recognizer: PageRecognizer,
  fileName: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const linesByPage: RawLine[][] = []
  let first: { width: number; height: number } | undefined

  for (let page = 0; page < pdf.pageCount; page++) {
    if (options.signal?.aborted) throw new DOMException('Parsing cancelled', 'AbortError')
    options.onProgress?.({
      fraction: page / pdf.pageCount,
      message: `Recognising page ${page + 1} of ${pdf.pageCount}`,
    })

    const [size, image] = await Promise.all([
      pdf.pageSize(page),
      pdf.render(page, OCR_RENDER_SCALE),
    ])
    const { height } = size
    first ??= size
    const lines = await raceAbort(recognizer.recognize(image), options.signal)
    linesByPage.push(
      lines.map((line) => ({
        page,
        block: line.block,
        words: line.words.map((word) => ({
          text: word.text,
          page,
          bbox: wordToTokenBox(word, height),
        })),
      })),
    )
  }
  options.onProgress?.({ fraction: 1, message: 'Done' })

  const tokens = linesToTokens(linesByPage)
  if (tokens.length === 0) {
    throw new ExtractionError('No text could be recognised in this PDF.')
  }
  return {
    title: chooseTitle(undefined, fileName),
    tokens,
    formatId: 'pdf',
    layout: { kind: 'paged', pages: pdf.pageCount, boxSpace: 'displayed' },
    page: first ? makePageSpec(first.width, first.height) : DEFAULT_PAGE,
    ocr: true,
  }
}
