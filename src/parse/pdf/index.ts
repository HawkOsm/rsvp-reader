import './worker-src'
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ExtractionError } from '../errors'
import { chooseTitle } from '../title'
import type { ParseResult, ProgressCallback } from '../types'
import { sortReadingOrder } from './columns'
import { flattenPdfWords } from './flatten'
import { itemsToLines } from './lines'
import { markParagraphBreaks } from './paragraphs'
import { dropRepeatedHeadersFooters } from './repeats'
import type { PdfTextItem, RawLine } from './types'

/** Below this many words per page on average, it's almost certainly a scan
 * with no text layer rather than a thin page of real prose. */
const SCANNED_PDF_WORDS_PER_PAGE = 5

export interface ParsePdfOptions {
  onProgress?: ProgressCallback
  signal?: AbortSignal
}

export async function parsePdf(file: File, options: ParsePdfOptions = {}): Promise<ParseResult> {
  const data = new Uint8Array(await file.arrayBuffer())
  let doc: PDFDocumentProxy
  try {
    doc = await getDocument({ data, verbosity: VerbosityLevel.ERRORS }).promise
  } catch (error) {
    // pdf.js sets `.name` to its exception class name rather than exporting
    // the classes somewhere convenient to `instanceof`-check against.
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new ExtractionError('This PDF is password protected.')
    }
    throw new ExtractionError(`Could not open PDF: ${(error as Error).message}`)
  }

  try {
    const pageCount = doc.numPages
    const linesByPage: RawLine[][] = []

    for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
      if (options.signal?.aborted) throw new DOMException('Parsing cancelled', 'AbortError')

      const page = await doc.getPage(pageNo)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      // pdf.js's TextItem has more fields than our PdfTextItem needs; the
      // filter just needs to drop TextMarkedContent entries (no `str`).
      const items = content.items.filter((item) => 'str' in item) as PdfTextItem[]
      // 0-based page numbers, matching text_extract.py's Token.page.
      const lines = itemsToLines(items, pageNo - 1)
      linesByPage.push(sortReadingOrder(lines, viewport.width))

      options.onProgress?.({
        fraction: pageNo / pageCount,
        message: `Page ${pageNo} of ${pageCount}`,
      })
    }

    const totalWords = linesByPage.reduce(
      (sum, page) => sum + page.reduce((n, line) => n + line.words.length, 0),
      0,
    )
    if (pageCount > 0 && totalWords / pageCount < SCANNED_PDF_WORDS_PER_PAGE) {
      throw new ExtractionError('This PDF has no text layer.')
    }

    const orderedLines = dropRepeatedHeadersFooters(linesByPage).flat()
    const lineEndsParagraph = markParagraphBreaks(orderedLines)
    const tokens = flattenPdfWords(orderedLines, lineEndsParagraph)

    if (tokens.length === 0) {
      throw new ExtractionError('This PDF has no text layer.')
    }

    return {
      title: await pdfTitle(doc, file.name),
      tokens,
      pages: pageCount,
    }
  } finally {
    await doc.destroy()
  }
}

async function pdfTitle(doc: PDFDocumentProxy, fileName: string): Promise<string> {
  try {
    const metadata = await doc.getMetadata()
    const info = metadata.info as { Title?: string } | undefined
    return chooseTitle(info?.Title, fileName)
  } catch {
    return chooseTitle(undefined, fileName)
  }
}
