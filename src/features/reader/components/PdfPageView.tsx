import { useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  screenToTokenPoint,
  screenToUserPoint,
  tokenBoxToScreen,
  userBoxToScreen,
  type Box,
  type PageLine,
  type PageSize,
  type PdfHandle,
} from '@/features/reader/api/pdf'
import { wordAt } from '@/features/reader/book-nav'
import { useEngine } from '@/features/reader/engine-context'
import { PdfTextLayer } from './PdfTextLayer'

/** Cap on the render density, so a 4K screen doesn't render giant bitmaps. */
const MAX_PIXEL_RATIO = 3

interface PdfPageViewProps {
  doc: PdfHandle
  pageIndex: number
  boxWidth: number
  /** With no `scale`, the page is also kept this short, so the whole page fits
   * the space it is given instead of running past it. */
  boxHeight?: number
  scale: number | undefined
  highlight: Box | null
  peek: boolean
  /** The book's boxes are in raw PDF user space (imported before MuPDF). */
  legacyBoxes: boolean
  onReady: () => void
}

/** What the page is currently drawn as: its size in points, and the CSS
 * pixels per point it was drawn at. */
interface Drawn {
  size: PageSize
  scale: number
  lines: PageLine[]
}

/** One rendered page: canvas, then the word highlight, then a text layer.
 * Only re-renders the canvas when the page or its size changes — moving
 * the highlight to the next word never repaints the page. */
export function PdfPageView({
  doc,
  pageIndex,
  boxWidth,
  boxHeight,
  scale,
  highlight,
  peek,
  legacyBoxes,
  onReady,
}: PdfPageViewProps) {
  const engine = useEngine()
  const markRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // The box only decides the size when no scale is given.
  const fitWidth = scale === undefined ? boxWidth : null
  const fitHeight = scale === undefined ? boxHeight : null

  useEffect(() => {
    let cancelled = false
    // Leaving this render superseded (a new scale, another page) cancels the
    // draw in the worker if it has not started, instead of letting it queue.
    const drawing = new AbortController()

    void (async () => {
      const pageSize = await doc.pageSize(pageIndex)
      if (cancelled) return
      const cssScale = Math.max(
        0.05,
        scale ?? Math.min(boxWidth / pageSize.width, (boxHeight ?? Infinity) / pageSize.height),
      )
      // Draw at the screen's real pixel density, then size the canvas back
      // down to CSS pixels — otherwise the browser stretches a low-res
      // bitmap over the page and the text goes soft.
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      const [bitmap, lines] = await Promise.all([
        doc.render(pageIndex, cssScale * ratio, { signal: drawing.signal }),
        doc.lines(pageIndex),
      ])
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (cancelled || !canvas || !ctx) return

      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.style.width = `${pageSize.width * cssScale}px`
      canvas.style.height = `${pageSize.height * cssScale}px`
      ctx.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0)
      setDrawn({ size: pageSize, scale: cssScale, lines })
      onReadyRef.current()
    })().catch(() => {
      // The document was closed or replaced while this was in flight.
    })

    return () => {
      cancelled = true
      drawing.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the box only matters when there is no `scale`
  }, [doc, pageIndex, fitWidth, fitHeight, scale])

  let mark: { left: number; top: number; width: number; height: number } | null = null
  if (drawn && highlight) {
    mark = legacyBoxes
      ? userBoxToScreen(highlight, drawn.size.userToPage, drawn.scale)
      : tokenBoxToScreen(highlight, drawn.size.height, drawn.scale)
  }

  // Keep the word being read in view as it moves down the page.
  const markTop = mark?.top
  useEffect(() => {
    if (peek) markRef.current?.scrollIntoView({ block: 'center' })
  }, [peek, markTop])

  /** Click a word to jump there, in book mode as beside the RSVP word: it is
   * how the reader picks where RSVP goes on. Not when the click ends a text
   * selection. */
  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (!drawn || !window.getSelection()?.isCollapsed) return
    const rect = event.currentTarget.getBoundingClientRect()
    const [x, y] = legacyBoxes
      ? screenToUserPoint(
          event.clientX - rect.left,
          event.clientY - rect.top,
          drawn.size.userToPage,
          drawn.scale,
        )
      : screenToTokenPoint(
          event.clientX - rect.left,
          event.clientY - rect.top,
          drawn.size.height,
          drawn.scale,
        )
    const hit = wordAt(engine.tokens, pageIndex, x, y)
    if (hit !== null) engine.seek(hit)
  }

  return (
    <div
      className="relative shadow-lg"
      style={
        drawn
          ? { width: drawn.size.width * drawn.scale, height: drawn.size.height * drawn.scale }
          : undefined
      }
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
      {drawn && <PdfTextLayer lines={drawn.lines} scale={drawn.scale} />}
    </div>
  )
}
