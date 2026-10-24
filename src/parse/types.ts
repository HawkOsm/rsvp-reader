import type { PageSpec } from '@/core/page-spec'
import type { ContentLayout, FormatId, Token } from '@/core/types'

export interface ParsedChapter {
  title: string
  startTokenIndex: number
}

/** Every parser returns this same shape, so the UI never cares about the
 * source file type. */
export interface ParseResult {
  title: string
  author?: string
  tokens: Token[]
  formatId: FormatId
  layout: ContentLayout
  /** The page's size, measured here once (the default if the format has none). */
  page: PageSpec
  /** The words were recognised from page images, not read from a text
   * layer, so expect the odd mistake. */
  ocr?: true
  /** EPUBs only — lets the UI offer a chapter jump. */
  chapters?: ParsedChapter[]
}

export interface ParseProgress {
  /** 0..1 */
  fraction: number
  message?: string
}

export type ProgressCallback = (progress: ParseProgress) => void

export interface ParseOptions {
  onProgress?: ProgressCallback
  signal?: AbortSignal
}
