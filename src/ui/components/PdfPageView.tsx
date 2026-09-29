import { TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs'
import './pdf-text-layer.css'
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { wordAt } from '../book-nav'
import { useEngine } from '../engine-context'

/** Cap on the render density, so a 4K screen doesn't render giant bitmaps. */
const MAX_PIXEL_RATIO = 3

interface PdfPageViewProps {
  doc: PDFDocumentProxy
  pageIndex: number
  boxWidth: number
  scale: number | undefined
  highlight: [number, number, number, number] | null
  peek: boolean
  onReady: () => void
}

/** One rendered page: canvas, then the word highlight, then a text layer.
 * Only re-renders the canvas when the page or its size changes — moving
 * the highlight to the next word never repaints the page. */
export function PdfPageView({
  doc,
  pageIndex,
  boxWidth,
  scale,
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
      const next = page.getViewport({ scale: Math.max(0.1, scale ?? boxWidth / unscaled.width) })
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
  }, [doc, pageIndex, boxWidth, scale])

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
