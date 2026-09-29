import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useState, type RefObject } from 'react'
import '../../parse/pdf/worker-src'
import { loadFile } from '../../storage/files'
import { getDb } from '../../storage/schema'

/** The book's stored PDF, opened — `null` until it loads. */
export function usePdfDocument(bookId: number): PDFDocumentProxy | null {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
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
  return doc
}

/** An element's client size, kept current as it resizes. */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
): { width: number; height: number } | null {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return box
}
