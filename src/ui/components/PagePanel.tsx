import { memo } from 'react'
import { useAppStore } from '../store'
import { PdfPagePanel } from './PdfPagePanel'
import { TextReflowPanel } from './TextReflowPanel'

export interface PagePanelProps {
  bookId: number
  pages?: number
  /** `side` is the panel beside the RSVP word: one page, filling the width,
   * with its own previous/next. `book` is the full-width reading view, laid
   * out by the reader's layout and page size. */
  variant?: 'side' | 'book'
}

/** Picks the PDF page renderer or the text/EPUB reflow view, by whether
 * the book has pages at all. */
export const PagePanel = memo(function PagePanel({ bookId, pages, variant = 'side' }: PagePanelProps) {
  const layout = useAppStore((s) => s.bookLayout)
  const scale = useAppStore((s) => s.bookScale)
  const setBookFits = useAppStore((s) => s.setBookFits)

  if (pages === undefined) return <TextReflowPanel />
  if (variant === 'book') return <PdfPagePanel bookId={bookId} layout={layout} scale={scale} onFits={setBookFits} />
  return <PdfPagePanel bookId={bookId} layout="single" peek />
})
