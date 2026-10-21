import type { Token } from '../../core/types'
import { wordToTokenBox } from '../../pdf/geometry'
import type { PdfDocument } from '../../pdf/document'
import { NoTextLayerError } from '../errors'
import { chooseTitle } from '../title'
import type { ParseOptions, ParseResult } from '../types'
import { flattenPdfWords } from './flatten'
import { joinLetterSpacedLines } from './spaced'
import { markParagraphBreaks } from './paragraphs'
import { dropRepeatedHeadersFooters } from './repeats'
import type { RawLine } from './types'

/** Below this many words per page on average, it's almost certainly a scan
 * with no text layer rather than a thin page of real prose. */
const SCANNED_PDF_WORDS_PER_PAGE = 5

/** How long to read pages before handing the thread back, so a worker can
 * notice a cancel or report progress. */
const YIELD_EVERY_MS = 50

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** A PDF's words, in reading order, as a `ParseResult`. */
export async function extractPdf(
  doc: PdfDocument,
  fileName: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const pageCount = doc.pageCount
  const linesByPage: RawLine[][] = []
  let lastYield = Date.now()

  for (let page = 0; page < pageCount; page++) {
    if (options.signal?.aborted) throw new DOMException('Parsing cancelled', 'AbortError')

    const { height } = doc.pageSize(page)
    linesByPage.push(
      doc.lines(page).map((line) => ({
        page,
        block: line.block,
        words: line.words.map((word) => ({
          text: word.text,
          page,
          bbox: wordToTokenBox(word, height),
        })),
      })),
    )

    options.onProgress?.({
      fraction: (page + 1) / pageCount,
      message: `Page ${page + 1} of ${pageCount}`,
    })
    if (Date.now() - lastYield > YIELD_EVERY_MS) {
      await nextTask()
      lastYield = Date.now()
    }
  }

  const totalWords = linesByPage.reduce(
    (sum, lines) => sum + lines.reduce((n, line) => n + line.words.length, 0),
    0,
  )
  if (pageCount > 0 && totalWords / pageCount < SCANNED_PDF_WORDS_PER_PAGE) {
    throw new NoTextLayerError()
  }

  const tokens = linesToTokens(linesByPage)
  if (tokens.length === 0) throw new NoTextLayerError()

  return {
    title: chooseTitle(doc.title(), fileName),
    tokens,
    formatId: 'pdf',
    layout: { kind: 'paged', pages: pageCount, boxSpace: 'displayed' },
  }
}

/** Every page's lines (in reading order) to the book's tokens: running
 * headers and footers dropped, letter-spaced headings joined into words,
 * paragraph ends marked, hyphenated words rejoined. Shared by reading a text layer and by OCR. */
export function linesToTokens(linesByPage: RawLine[][]): Token[] {
  const orderedLines = joinLetterSpacedLines(dropRepeatedHeadersFooters(linesByPage).flat())
  return flattenPdfWords(orderedLines, markParagraphBreaks(orderedLines))
}
