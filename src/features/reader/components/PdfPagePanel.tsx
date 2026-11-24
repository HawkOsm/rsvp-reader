import { useEffect, useMemo, useRef, useState } from 'react'
import {
  goToPage,
  pageLabel,
  pageOfToken,
  perSpread,
  spreadStart,
  turn,
} from '@/features/reader/book-nav'
import {
  GUTTER,
  MARGIN,
  MAX_SCALE,
  fitScales,
  type PageSpread,
  type FitScales,
} from '@/lib/book-layout'
import { useBookGestures, type BookGestures } from '@/features/reader/hooks/useBookGestures'
import { BOOK_SCROLL_ID, scrollOrTurn } from '@/features/reader/book-scroll'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'
import { useAppStore } from '@/stores/app-store'
import { useElementSize, usePdfDocument } from '@/features/reader/hooks/usePdfDocument'
import { Button } from '@/components/Button'
import { PdfPageView } from './PdfPageView'

export interface PdfPagePanelProps {
  bookId: number
  /** One page, or an open two-page spread. */
  layout?: PageSpread
  /** Page size as a PDF scale (1 = 100%): a number to draw at, `null` to
   * wait until one is known, or left out to fit the panel's width. */
  scale?: number | null
  /** Told what scale would fit the page / the width, for the size controls. */
  onFits?: (fits: FitScales) => void
  /** A pinch asked for this scale. With `onFitToggle` (a double tap), turns
   * on touch gestures: tap or swipe to turn the page, pinch, double-tap. */
  onZoom?: (scale: number) => void
  onFitToggle?: () => void
  /** A finger asked for the reader's controls to be shown or hidden (a tap
   * in the middle), or turned a page, which hides them. */
  onControls?: (show: 'toggle' | false) => void
  /** The small follow-along panel beside the RSVP word: a previous/next
   * header, click a word to jump there, and it scrolls to keep the current
   * word in view. The full-width book view has its own controls instead. */
  peek?: boolean
  /** The book's boxes are in raw PDF user space (imported before MuPDF). */
  legacyBoxes?: boolean
}

/**
 * Renders the PDF page(s) the reader is on, with the current word
 * highlighted over its stored bbox and a transparent text layer on top so
 * the words can be selected and copied. Which page shows is derived from
 * the engine's position, so RSVP and book reading never disagree.
 */
export function PdfPagePanel({
  bookId,
  layout = 'single',
  scale,
  onFits,
  onZoom,
  onFitToggle,
  onControls,
  peek = false,
  legacyBoxes = false,
}: PdfPagePanelProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  const doc = usePdfDocument(bookId)
  const [ready, setReady] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [fits, setFits] = useState<FitScales | null>(null)
  // The scroller's size decides the page scale, and it settles a layout
  // pass after mount, so watch it rather than read it once.
  const box = useElementSize(scrollRef)
  const pendingBottom = useRef(false)

  const token = engine.tokens[index]
  const tokenPage = pageOfToken(token)
  const start = spreadStart(tokenPage, layout)
  const count = doc?.pageCount ?? 0
  const pages = useMemo(() => {
    const list: number[] = []
    for (let p = start; p < Math.min(start + perSpread(layout), count); p++) list.push(p)
    return list
  }, [start, layout, count])

  // Report the scales that would fit these pages to the window, whenever
  // the pages or the window change.
  useEffect(() => {
    if (!doc || !box || !onFits || pages.length === 0) return
    let cancelled = false
    Promise.all(pages.map((p) => doc.pageSize(p)))
      .then((sizes) => {
        if (cancelled) return
        const fitted = fitScales(sizes, box)
        setFits(fitted)
        onFits(fitted)
      })
      .catch(() => {
        // The book was closed or the engine restarted; the reopened one reports again.
      })
    return () => {
      cancelled = true
    }
  }, [doc, box, pages, onFits])

  // A new spread starts at the top — or, arriving backwards from below, at
  // the bottom once its pages have reported their size.
  useEffect(() => {
    setReady(0)
    pendingBottom.current = useAppStore.getState().consumeArriveAtBottom()
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [start, layout])
  useEffect(() => {
    const el = scrollRef.current
    if (el && pendingBottom.current && pages.length > 0 && ready >= pages.length) {
      el.scrollTop = el.scrollHeight
      pendingBottom.current = false
    }
  }, [ready, pages.length])

  // Touch: a swipe turns the page while it is no wider than its area (a
  // wider one scrolls sideways instead); a tap at an edge turns it too,
  // scrolling a tall page first, as the arrow keys do; a tap in the middle
  // is for the controls; a pinch zooms no further out than the whole page;
  // a double tap switches between the two fits.
  const canSwipe = !fits || scale == null || scale <= fits.width + 0.001
  const gestures = useMemo<BookGestures | null>(() => {
    if (!onZoom || !onFitToggle) return null
    return {
      canSwipe,
      scale: scale ?? null,
      minScale: fits ? Math.min(fits.page, fits.width) : 0,
      maxScale: MAX_SCALE,
      onTurn: (direction) => {
        turn(engine, count, layout, direction)
        onControls?.(false)
      },
      onZoom,
      onTap: (zone) => {
        if (zone === 'middle') return onControls?.('toggle')
        scrollOrTurn(engine, count, layout, zone === 'forward' ? 1 : -1)
        onControls?.(false)
      },
      onDoubleTap: onFitToggle,
    }
  }, [onZoom, onFitToggle, onControls, canSwipe, scale, fits, engine, count, layout])
  useBookGestures(scrollRef, pagesRef, gestures)

  // With no scale given (the side panel), pages fill the panel's width.
  const per = pages.length || 1
  const boxWidth = box
    ? Math.max(80, (box.width - (peek ? 0 : MARGIN) - GUTTER * (per - 1)) / per)
    : 0

  return (
    <div className={`flex h-full flex-col ${peek ? '' : 'bg-bg-raised'}`}>
      {peek && (
        <div
          className="pointer-events-auto flex items-center justify-between rounded bg-bg-raised/90 px-[0.6em] py-[0.3em] text-text-dim"
          style={{ fontSize: box ? Math.round(Math.min(20, Math.max(10, box.width / 26))) : 14 }}
        >
          <Button
            aria-label="Previous page"
            disabled={start <= 0}
            onClick={() => goToPage(engine, count, layout, start - perSpread(layout))}
            variant="link"
            className="px-[0.6em]"
            style={{ fontSize: 'inherit' }}
          >
            ‹
          </Button>
          <span>{pageLabel(tokenPage, count, layout)}</span>
          <Button
            aria-label="Next page"
            disabled={start + perSpread(layout) >= count}
            onClick={() => goToPage(engine, count, layout, start + perSpread(layout))}
            variant="link"
            className="px-[0.6em]"
            style={{ fontSize: 'inherit' }}
          >
            ›
          </Button>
        </div>
      )}
      <div
        ref={scrollRef}
        id={BOOK_SCROLL_ID}
        className={`flex min-h-0 flex-1 overflow-auto ${peek ? '' : 'p-2 [scrollbar-gutter:stable]'}`}
        // The browser scrolls; sideways swipes and pinches are left to the
        // gestures above, unless the page is wide enough to scroll sideways.
        style={gestures ? { touchAction: canSwipe ? 'pan-y' : 'pan-x pan-y' } : undefined}
      >
        {/* Auto margins centre pages smaller than the area, both ways, and
            give way when they are bigger, so every part can be scrolled to.
            The side panel's page keeps to the top. */}
        <div
          ref={pagesRef}
          className={`flex w-fit items-start ${peek ? 'mx-auto' : 'm-auto'}`}
          style={{ gap: GUTTER }}
        >
          {doc &&
            box &&
            scale !== null &&
            pages.map((pageIndex) => (
              <PdfPageView
                key={pageIndex}
                doc={doc}
                pageIndex={pageIndex}
                boxWidth={boxWidth}
                boxHeight={peek && box ? Math.max(40, box.height) : undefined}
                scale={scale}
                highlight={pageIndex === tokenPage ? (token?.bbox ?? null) : null}
                peek={peek}
                legacyBoxes={legacyBoxes}
                onReady={() => setReady((n) => n + 1)}
              />
            ))}
        </div>
      </div>
    </div>
  )
}
