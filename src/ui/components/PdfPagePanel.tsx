import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { loadFile } from '../../storage/files'
import { getDb } from '../../storage/schema'
import { useEngine } from '../engine-context'

export interface PdfPagePanelProps {
  bookId: number
}

/**
 * Renders the PDF page the reader is currently on, with the current word
 * highlighted over its stored bbox. No click-to-jump here (unlike
 * TextReflowPanel) — hit-testing every word's approximate bbox against a
 * click on a rendered page is real extra work; left for later. See
 * DECISIONS.md.
 */
export function PdfPagePanel({ bookId }: PdfPagePanelProps) {
  const engine = useEngine()
  const [index, setIndex] = useState(engine.index)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => engine.on('word', setIndex), [engine])

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

  const currentPage = engine.tokens[index]?.page ?? -1

  useEffect(() => {
    if (!doc || currentPage < 0) return
    let cancelled = false

    void doc.getPage(currentPage + 1).then(async (page) => {
      if (cancelled) return
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const unscaled = page.getViewport({ scale: 1 })
      const scale = Math.max(0.1, container.clientWidth / unscaled.width)
      const viewport = page.getViewport({ scale })
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = viewport.width
      canvas.height = viewport.height
      const renderTask = page.render({ canvasContext: ctx, viewport, canvas })
      await renderTask.promise
      if (cancelled) return

      const token = engine.tokens[index]
      if (token?.bbox) {
        const [x0, y0, x1, y1] = token.bbox
        const [rx0, ry0] = viewport.convertToViewportPoint(x0, y0)
        const [rx1, ry1] = viewport.convertToViewportPoint(x1, y1)
        ctx.fillStyle = 'rgba(255, 90, 95, 0.35)'
        ctx.fillRect(
          Math.min(rx0, rx1),
          Math.min(ry0, ry1),
          Math.abs(rx1 - rx0),
          Math.abs(ry1 - ry0),
        )
      }
    })

    return () => {
      cancelled = true
    }
  }, [doc, currentPage, index, engine])

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[var(--color-bg-raised)] p-4">
      <canvas ref={canvasRef} className="mx-auto shadow-lg" />
    </div>
  )
}
