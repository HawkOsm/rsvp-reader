import { useEffect, useMemo, useRef, useState } from 'react'
import {
  goToPage,
  pageLabel,
  pageOfToken,
  perSpread,
  spreadStart,
} from '@/features/reader/book-nav'
import { GUTTER, MARGIN, fitScales, type PageSpread, type FitScales } from '@/lib/book-layout'
import { BOOK_SCROLL_ID } from '@/features/reader/book-scroll'
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
  peek = false,
  legacyBoxes = false,
}: PdfPagePanelProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  const doc = usePdfDocument(bookId)
  const [ready, setReady] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
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
        if (!cancelled) onFits(fitScales(sizes, box))
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

  // With no scale given (the side panel), pages fill the panel's width.
  const per = pages.length || 1
  const boxWidth = box ? Math.max(80, (box.width - MARGIN - GUTTER * (per - 1)) / per) : 0

  return (
    <div className={`flex h-full flex-col ${peek ? '' : 'bg-[var(--color-bg-raised)]'}`}>
      {peek && (
        <div className="pointer-events-auto flex items-center justify-between rounded bg-[var(--color-bg-raised)]/90 px-2 py-1 text-sm text-[var(--color-text-dim)]">
          <Button
            aria-label="Previous page"
            disabled={start <= 0}
            onClick={() => goToPage(engine, count, layout, start - perSpread(layout))}
            variant="link"
            className="px-2"
          >
            ‹
          </Button>
          <span>{pageLabel(tokenPage, count, layout)}</span>
          <Button
            aria-label="Next page"
            disabled={start + perSpread(layout) >= count}
            onClick={() => goToPage(engine, count, layout, start + perSpread(layout))}
            variant="link"
            className="px-2"
          >
            ›
          </Button>
        </div>
      )}
      <div
        ref={scrollRef}
        id={BOOK_SCROLL_ID}
        className="min-h-0 flex-1 overflow-auto p-2 [scrollbar-gutter:stable]"
      >
        <div className="mx-auto flex w-fit items-start" style={{ gap: GUTTER }}>
          {doc &&
            box &&
            scale !== null &&
            pages.map((pageIndex) => (
              <PdfPageView
                key={pageIndex}
                doc={doc}
                pageIndex={pageIndex}
                boxWidth={boxWidth}
                boxHeight={peek && box ? Math.max(40, box.height - 16) : undefined}
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
