import { memo } from 'react'
import type { ContentLayout } from '@/core/types'
import { useAppStore } from '@/stores/app-store'
import { PdfPagePanel } from './PdfPagePanel'
import { TextReflowPanel } from './TextReflowPanel'

export interface PagePanelProps {
  bookId: number
  layout: ContentLayout
  /** `side` is the panel beside the RSVP word: one page, filling the width,
   * with its own previous/next. `book` is the full-width reading view, laid
   * out by the reader's layout and page size. */
  variant?: 'side' | 'book'
}

/** Picks the page renderer (paged books) or the reflow view, by the book's
 * layout. Only PDFs are paged today, so paged means the PDF renderer. */
export const PagePanel = memo(function PagePanel({
  bookId,
  layout,
  variant = 'side',
}: PagePanelProps) {
  const bookLayout = useAppStore((s) => s.bookLayout)
  const scale = useAppStore((s) => s.bookScale)
  const setBookFits = useAppStore((s) => s.setBookFits)

  if (layout.kind === 'reflow') return <TextReflowPanel book={variant === 'book'} />
  const legacyBoxes = layout.boxSpace !== 'displayed'
  if (variant === 'book') {
    return (
      <PdfPagePanel
        bookId={bookId}
        layout={bookLayout}
        scale={scale}
        onFits={setBookFits}
        legacyBoxes={legacyBoxes}
      />
    )
  }
  return <PdfPagePanel bookId={bookId} layout="single" peek legacyBoxes={legacyBoxes} />
})
