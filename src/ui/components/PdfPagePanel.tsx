import { TextLayer, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import 'pdfjs-dist/web/pdf_viewer.css'
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import '../../parse/pdf/worker-src'
import { loadFile } from '../../storage/files'
import { getDb } from '../../storage/schema'
import {
  BOOK_SCROLL_ID,
  consumeArriveAtBottom,
  goToPage,
  pageLabel,
  pageOfToken,
  perSpread,
  spreadStart,
  wordAt,
  type BookFit,
  type BookLayout,
} from '../book-nav'
import { useEngine, useEngineIndex } from '../engine-context'
import { Button } from './Button'

/** The gap down the middle of an open book. */
const GUTTER = 38
/** Cap on the render density, so a 4K screen doesn't render giant bitmaps. */
const MAX_PIXEL_RATIO = 3
/** Padding around the pages inside the scroller (p-2 on each side). */
const MARGIN = 16

export interface PdfPagePanelProps {
  bookId: number
  /** One page, or an open two-page spread. */
  layout?: BookLayout
  /** Whole page(s) at once, or fill the width and scroll down. */
  fit?: BookFit
  /** Page size as a multiple of the fitted size; pages scroll when larger. */
  zoom?: number
  /** The small follow-along panel beside the RSVP word: a previous/next
   * header, click a word to jump there, and it scrolls to keep the current
   * word in view. The full-width book view has its own controls instead. */
  peek?: boolean
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
  fit = 'width',
  zoom = 1,
  peek = false,
}: PdfPagePanelProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  const [ready, setReady] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingBottom = useRef(false)

  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    void loadFile(getDb(), bookId).then(async (record) => {
      if (!record || cancelled) return
      const data = new Uint8Array(await record.blob.arrayBuffer())
      const opened = await getDocument({ data }).promise
      if (cancelled) {
        void opened.destroy()
        return
      }
      loaded = opened
      setDoc(opened)
    })
    return () => {
      cancelled = true
      void loaded?.destroy()
    }
  }, [bookId])

  // The scroller's size decides the page scale, and it settles a layout
  // pass after mount, so watch it rather than read it once.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const token = engine.tokens[index]
  const tokenPage = pageOfToken(token)
  const start = spreadStart(tokenPage, layout)
  const count = doc?.numPages ?? 0
  const pages: number[] = []
  for (let p = start; p < Math.min(start + perSpread(layout), count); p++) pages.push(p)

  // A new spread starts at the top — or, arriving backwards from below, at
  // the bottom once its pages have reported their size.
  useEffect(() => {
    setReady(0)
    pendingBottom.current = consumeArriveAtBottom()
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [start, layout, fit])
  useEffect(() => {
    const el = scrollRef.current
    if (el && pendingBottom.current && pages.length > 0 && ready >= pages.length) {
      el.scrollTop = el.scrollHeight
      pendingBottom.current = false
    }
  }, [ready, pages.length])

  const per = pages.length || 1
  const boxWidth = box ? Math.max(80, ((box.width - MARGIN - GUTTER * (per - 1)) / per) * zoom) : 0
  const boxHeight = box && fit === 'page' ? (box.height - MARGIN) * zoom : null

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-raised)]">
      {peek && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text-dim)]">
          <Button
            aria-label="Previous page"
            disabled={start <= 0}
            onClick={() => goToPage(engine, count, layout, start - perSpread(layout))}
            variant="link" className="px-2"
          >
            ‹
          </Button>
          <span>{pageLabel(tokenPage, count, layout)}</span>
          <Button
            aria-label="Next page"
            disabled={start + perSpread(layout) >= count}
            onClick={() => goToPage(engine, count, layout, start + perSpread(layout))}
            variant="link" className="px-2"
          >
            ›
          </Button>
        </div>
      )}
      <div ref={scrollRef} id={BOOK_SCROLL_ID} className="min-h-0 flex-1 overflow-auto p-2">
        <div className="mx-auto flex w-fit items-start" style={{ gap: GUTTER }}>
          {doc &&
            box &&
            pages.map((pageIndex) => (
              <PdfPageView
                key={pageIndex}
                doc={doc}
                pageIndex={pageIndex}
                boxWidth={boxWidth}
                boxHeight={boxHeight}
                highlight={pageIndex === tokenPage ? (token?.bbox ?? null) : null}
                peek={peek}
                onReady={() => setReady((n) => n + 1)}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

interface PdfPageViewProps {
  doc: PDFDocumentProxy
  pageIndex: number
  boxWidth: number
  boxHeight: number | null
  highlight: [number, number, number, number] | null
  peek: boolean
  onReady: () => void
}

/** One rendered page: canvas, then the word highlight, then a text layer.
 * Only re-renders the canvas when the page or its size changes — moving
 * the highlight to the next word never repaints the page. */
function PdfPageView({
  doc,
  pageIndex,
  boxWidth,
  boxHeight,
  highlight,
  peek,
  onReady,
}: PdfPageViewProps) {
  const engine = useEngine()
  const markRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<PageViewport | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    let cancelled = false
    let renderTask: RenderTask | null = null
    let layer: TextLayer | null = null

    void doc.getPage(pageIndex + 1).then(async (page) => {
      const canvas = canvasRef.current
      const host = textRef.current
      if (cancelled || !canvas || !host) return

      const unscaled = page.getViewport({ scale: 1 })
      let scale = boxWidth / unscaled.width
      if (boxHeight !== null) scale = Math.min(scale, boxHeight / unscaled.height)
      const next = page.getViewport({ scale: Math.max(0.1, scale) })
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Draw at the screen's real pixel density, then size the canvas back
      // down to CSS pixels — otherwise the browser stretches a low-res
      // bitmap over the page and the text goes soft.
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      canvas.width = Math.floor(next.width * ratio)
      canvas.height = Math.floor(next.height * ratio)
      canvas.style.width = `${next.width}px`
      canvas.style.height = `${next.height}px`
      host.replaceChildren()
      host.style.setProperty('--total-scale-factor', String(next.scale))
      setViewport(next)

      layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: host,
        viewport: next,
      })
      layer.render().catch(() => {})

      renderTask = page.render({
        canvasContext: ctx,
        viewport: next,
        canvas,
        transform: [ratio, 0, 0, ratio, 0, 0],
      })
      try {
        await renderTask.promise
        if (!cancelled) onReadyRef.current()
      } catch {
        // cancelled by a newer render — nothing to do
      }
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
      layer?.cancel()
    }
  }, [doc, pageIndex, boxWidth, boxHeight])

  let mark: { left: number; top: number; width: number; height: number } | null = null
  if (viewport && highlight) {
    const [x0, y0, x1, y1] = highlight
    const [rx0, ry0] = viewport.convertToViewportPoint(x0, y0)
    const [rx1, ry1] = viewport.convertToViewportPoint(x1, y1)
    mark = {
      left: Math.min(rx0, rx1),
      top: Math.min(ry0, ry1),
      width: Math.abs(rx1 - rx0),
      height: Math.abs(ry1 - ry0),
    }
  }

  // Keep the word being read in view as it moves down the page.
  const markTop = mark?.top
  useEffect(() => {
    if (peek) markRef.current?.scrollIntoView({ block: 'center' })
  }, [peek, markTop])

  /** Click a word to jump there — unless the click ends a text selection. */
  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (!peek || !viewport || !window.getSelection()?.isCollapsed) return
    const rect = event.currentTarget.getBoundingClientRect()
    const [x, y] = viewport.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top)
    const hit = wordAt(engine.tokens, pageIndex, x, y)
    if (hit !== null) engine.seek(hit)
  }

  return (
    <div
      className="relative shadow-lg"
      style={viewport ? { width: viewport.width, height: viewport.height } : undefined}
      onClick={onClick}
    >
      <canvas ref={canvasRef} className="block" />
      {mark && (
        <div
          ref={markRef}
          className="pointer-events-none absolute"
          style={{ ...mark, background: 'rgba(255, 90, 95, 0.35)' }}
        />
      )}
      <div ref={textRef} className="textLayer" />
    </div>
  )
}
