import { useEffect, useRef, useState, type RefObject } from 'react'
import { pdfClient, type PdfHandle } from '../../pdf/client'
import { loadFile } from '../../storage/files'
import { getDb } from '../../storage/schema'

/** The engine dying more than this many times within the window is not a
 * glitch to recover from; the panel stays empty rather than loop. */
const MAX_CRASHES = 3
const CRASH_WINDOW_MS = 60_000

/** The book's stored PDF, opened in the PDF worker — `null` until it loads
 * (and again for a moment if the engine has to be restarted under it). */
export function usePdfDocument(bookId: number): PdfHandle | null {
  const [doc, setDoc] = useState<PdfHandle | null>(null)
  const [attempt, setAttempt] = useState(0)
  const crashes = useRef<number[]>([])
  useEffect(() => {
    let cancelled = false
    let opened: PdfHandle | null = null
    let forgetLost = () => {}
    void (async () => {
      const record = await loadFile(getDb(), bookId)
      if (!record || cancelled) return
      const handle = await pdfClient.open(await record.blob.arrayBuffer())
      if (cancelled) {
        handle.close()
        return
      }
      opened = handle
      forgetLost = handle.onLost(() => {
        if (cancelled) return
        setDoc(null)
        const now = Date.now()
        crashes.current = [...crashes.current.filter((t) => now - t < CRASH_WINDOW_MS), now]
        if (crashes.current.length <= MAX_CRASHES) setAttempt((n) => n + 1)
      })
      setDoc(handle)
    })().catch(() => {
      // A PDF that will not open leaves the panel empty, as a missing file does.
    })
    return () => {
      cancelled = true
      forgetLost()
      opened?.close()
      setDoc(null)
    }
  }, [bookId, attempt])
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
