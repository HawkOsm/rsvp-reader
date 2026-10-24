import { reviveError } from '@/parse/worker-errors'
import type { ParseResult } from '@/parse/types'
import type { PageLine, PageSize, RenderedPage } from './document'
import type { PdfRequest, PdfResponse, PdfResults } from './protocol'

/** The slice of `Worker` the client uses, so tests can stand in for one. */
export interface WorkerLike {
  postMessage(message: PdfRequest, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<PdfResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate(): void
}

/** A book that is open in the worker. */
export interface PdfHandle {
  readonly pageCount: number
  pageSize(page: number): Promise<PageSize>
  /** Draw a page at `scale` (1 = 72 dpi). Aborting stops a draw that has
   * not started yet and abandons one that has. */
  render(page: number, scale: number, options?: { signal?: AbortSignal }): Promise<RenderedPage>
  /** The page's text, line by line, for the selectable text layer. */
  lines(page: number): Promise<PageLine[]>
  /** Told if the PDF engine dies while this book is open, after which the
   * handle no longer works and the book has to be opened again. */
  onLost(listener: () => void): () => void
  close(): void
}

export interface ParseInWorkerOptions {
  onProgress?: (fraction: number, message?: string) => void
  signal?: AbortSignal
}

export interface PdfClientOptions {
  /** How long to keep the worker (and the ~10 MB engine in it) once
   * nothing is using it, so closing a book and opening the next does not
   * pay for starting it again. */
  idleMs?: number
}

interface Pending {
  resolve: (value: never) => void
  reject: (error: Error) => void
  onProgress?: (fraction: number, message?: string) => void
  /** Detach what was hung on the caller's abort signal. */
  release?: () => void
}

/** Pages whose lines are kept: the ones on screen, and a little around them. */
const LINES_CACHED = 8

const aborted = () => new DOMException('Cancelled', 'AbortError')

export function createPdfClient(
  makeWorker: () => WorkerLike,
  { idleMs = 30_000 }: PdfClientOptions = {},
) {
  let worker: WorkerLike | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let nextId = 1
  let nextDoc = 1
  const pending = new Map<number, Pending>()
  /** Every book open in the current worker, with who to tell if it dies. */
  const live = new Map<number, Set<() => void>>()

  function stop() {
    clearTimeout(idleTimer)
    worker?.terminate()
    worker = null
  }

  function failAll(error: Error) {
    for (const entry of pending.values()) {
      entry.release?.()
      entry.reject(error)
    }
    pending.clear()
    const lost = [...live.values()]
    live.clear()
    stop()
    for (const listeners of lost) for (const listener of listeners) listener()
  }

  function start(): WorkerLike {
    clearTimeout(idleTimer)
    if (worker) return worker
    const created = makeWorker()
    created.onmessage = ({ data }) => {
      const entry = pending.get(data.id)
      if (!entry) return // already abandoned (cancelled, or the worker was replaced)
      if (data.type === 'progress') {
        entry.onProgress?.(data.fraction, data.message)
        return
      }
      pending.delete(data.id)
      entry.release?.()
      if (data.type === 'done') entry.resolve(data.result as never)
      else entry.reject(reviveError(data.kind, data.message))
      settle()
    }
    created.onerror = (event) => failAll(new Error(event.message || 'The PDF engine crashed.'))
    worker = created
    return created
  }

  /** Called when work finishes: start the idle clock if nothing is left. */
  function settle() {
    if (pending.size === 0 && live.size === 0) {
      clearTimeout(idleTimer)
      // Re-checked when it fires: a document can open between a request
      // finishing (which starts this clock) and being counted in `live`.
      idleTimer = setTimeout(() => {
        if (pending.size === 0 && live.size === 0) stop()
      }, idleMs)
    }
  }

  /** Ask the worker to drop request `target`. Nothing waits for the answer. */
  function sendCancel(target: number) {
    worker?.postMessage({ id: nextId++, type: 'cancel', target })
  }

  function call<K extends PdfRequest['type']>(
    type: K,
    fields: Omit<Extract<PdfRequest, { type: K }>, 'id' | 'type'>,
    options: {
      transfer?: Transferable[]
      onProgress?: Pending['onProgress']
      signal?: AbortSignal
    } = {},
  ): { id: number; result: Promise<PdfResults[K]> } {
    const id = nextId++
    const result = new Promise<PdfResults[K]>((resolve, reject) => {
      if (options.signal?.aborted) return reject(aborted())
      pending.set(id, {
        resolve: resolve as Pending['resolve'],
        reject,
        onProgress: options.onProgress,
      })
      try {
        // `fields` always matches `type`; TypeScript can't see that through the generic.
        start().postMessage({ id, type, ...fields } as unknown as PdfRequest, options.transfer)
      } catch (error) {
        pending.delete(id)
        reject(error as Error)
        return
      }
      const signal = options.signal
      if (!signal) return
      // Whoever settles the request must also remove this: the signal often
      // outlives it (one per mounted page), and the listener would hold the
      // answer, a bitmap of up to 64 MB, until the signal is collected.
      const onAbort = () => {
        if (!pending.delete(id)) return
        reject(aborted())
        sendCancel(id)
        settle()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      const entry = pending.get(id)
      if (entry) entry.release = () => signal.removeEventListener('abort', onAbort)
    })
    return { id, result }
  }

  return {
    /** Read a PDF into tokens. Cancelling stops the worker at its next page. */
    async parse(
      file: File,
      { onProgress, signal }: ParseInWorkerOptions = {},
    ): Promise<ParseResult> {
      const data = await file.arrayBuffer()
      if (signal?.aborted) throw aborted()
      const { id, result } = call(
        'parse',
        { fileName: file.name, data },
        { transfer: [data], onProgress },
      )
      const onAbort = () => sendCancel(id)
      signal?.addEventListener('abort', onAbort)
      try {
        return await result
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    },

    /** Keep a PDF open for reading. Call `close()` on the handle when done. */
    async open(data: ArrayBuffer): Promise<PdfHandle> {
      const doc = nextDoc++
      const { pageCount } = await call('open', { doc, data }, { transfer: [data] }).result
      const listeners = new Set<() => void>()
      live.set(doc, listeners)
      const sizes = new Map<number, Promise<PageSize>>()
      const lines = new Map<number, Promise<PageLine[]>>()
      const lost = () =>
        Promise.reject(
          new Error('That PDF is not open (the book was closed, or the PDF engine restarted).'),
        )

      /** Remember a page's answer, but not a failed one, and not too many. */
      function cached<T>(
        cache: Map<number, Promise<T>>,
        page: number,
        limit: number,
        ask: () => Promise<T>,
      ) {
        let answer = cache.get(page)
        if (!answer) {
          answer = ask()
          cache.set(page, answer)
          answer.catch(() => cache.delete(page))
          if (cache.size > limit) cache.delete(cache.keys().next().value as number)
        }
        return answer
      }

      return {
        pageCount,
        pageSize: (page) =>
          live.has(doc)
            ? cached(sizes, page, Infinity, () => call('pageSize', { doc, page }).result)
            : lost(),
        render: (page, scale, options) =>
          live.has(doc)
            ? call('render', { doc, page, scale }, { signal: options?.signal }).result
            : lost(),
        lines: (page) =>
          live.has(doc)
            ? cached(lines, page, LINES_CACHED, () => call('lines', { doc, page }).result)
            : lost(),
        onLost(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        close() {
          if (!live.delete(doc)) return
          void call('close', { doc }).result.catch(() => {})
          settle()
        },
      }
    },
  }
}

/** The app's one PDF engine. The worker behind it starts on first use. */
export const pdfClient = createPdfClient(
  () => new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' }) as WorkerLike,
)
