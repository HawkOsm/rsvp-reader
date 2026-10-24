import type { ParseResult } from '@/parse/types'
import type { PageLine, PageSize, RenderedPage } from './document'

// What the main thread and the PDF worker say to each other. Every request
// carries an `id`; the worker answers with the same id.

export type PdfRequest =
  /** Read a whole PDF into tokens and close it again (an import). */
  | { id: number; type: 'parse'; fileName: string; data: ArrayBuffer }
  /** Keep a PDF open, under `doc`, for reading. */
  | { id: number; type: 'open'; doc: number; data: ArrayBuffer }
  | { id: number; type: 'pageSize'; doc: number; page: number }
  | { id: number; type: 'render'; doc: number; page: number; scale: number }
  | { id: number; type: 'lines'; doc: number; page: number }
  | { id: number; type: 'close'; doc: number }
  /** Stop request `target` (a parse, or a render still queued) at the next chance. */
  | { id: number; type: 'cancel'; target: number }

/** What each request type answers with. */
export interface PdfResults {
  parse: ParseResult
  open: { pageCount: number }
  pageSize: PageSize
  render: RenderedPage
  lines: PageLine[]
  close: null
  cancel: null
}

/** Error classes don't survive `postMessage`, so the kind travels with the
 * message and the main thread rebuilds the right class. */
export type PdfErrorKind = 'extraction' | 'no-text-layer' | 'aborted' | 'other'

export type PdfResponse =
  | { id: number; type: 'progress'; fraction: number; message?: string }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; kind: PdfErrorKind; message: string }
