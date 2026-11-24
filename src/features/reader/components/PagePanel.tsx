import { memo } from 'react'
import type { ContentLayout } from '@/core/types'
import { useBookSpread, useSmallScreenFit } from '@/features/reader/hooks/useBookSpread'
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
  /** Book view only: a touch asked to show or hide the reader's controls. */
  onControls?: (show: 'toggle' | false) => void
}

/** Picks the page renderer (paged books) or the reflow view, by the book's
 * layout. Only PDFs are paged today, so paged means the PDF renderer. */
export const PagePanel = memo(function PagePanel({
  bookId,
  layout,
  variant = 'side',
  onControls,
}: PagePanelProps) {
  const { layout: bookLayout, canSpread } = useBookSpread()
  const scale = useAppStore((s) => s.bookScale)
  const setBookFits = useAppStore((s) => s.setBookFits)
  const setBookScale = useAppStore((s) => s.setBookScale)
  const fitBook = useAppStore((s) => s.fitBook)
  // A small screen starts each book fitted to its width.
  useSmallScreenFit(canSpread, variant === 'book' && layout.kind === 'paged')

  if (layout.kind === 'reflow') {
    return variant === 'book' ? (
      <TextReflowPanel book onControls={onControls} />
    ) : (
      <TextReflowPanel />
    )
  }
  const legacyBoxes = layout.boxSpace !== 'displayed'
  if (variant === 'book') {
    return (
      <PdfPagePanel
        bookId={bookId}
        layout={bookLayout}
        scale={scale}
        onFits={setBookFits}
        onZoom={setBookScale}
        onFitToggle={fitBook}
        onControls={onControls}
        legacyBoxes={legacyBoxes}
      />
    )
  }
  return <PdfPagePanel bookId={bookId} layout="single" peek legacyBoxes={legacyBoxes} />
})
