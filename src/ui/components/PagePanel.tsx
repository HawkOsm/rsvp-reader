import { memo } from 'react'
import { PdfPagePanel } from './PdfPagePanel'
import { TextReflowPanel } from './TextReflowPanel'

export interface PagePanelProps {
  bookId: number
  pages?: number
}

/** Picks the PDF page renderer or the text/EPUB reflow view, by whether
 * the book has pages at all. */
export const PagePanel = memo(function PagePanel({ bookId, pages }: PagePanelProps) {
  if (pages !== undefined) return <PdfPagePanel bookId={bookId} />
  return <TextReflowPanel />
})
