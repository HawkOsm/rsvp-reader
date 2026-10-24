import { describeError } from '@/parse/worker-errors'
import { extractPdf } from '@/parse/pdf/extract'
import { openPdf, type PdfDocument, type RenderedPage } from './document'
import type { PdfRequest, PdfResponse, PdfResults } from './protocol'

type RenderRequest = Extract<PdfRequest, { type: 'render' }>

interface QueuedRender {
  request: RenderRequest
  resolve: (page: RenderedPage) => void
  reject: (error: unknown) => void
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const cancelled = () => new DOMException('Render cancelled', 'AbortError')

/** The PDF worker's brain, with the worker plumbing taken out so it can be
 * driven directly in tests: feed it requests, it calls `send` with answers.
 *
 * Holds every document the main thread has opened, but the app only ever
 * keeps one open at a time (the book being read), plus a transient one per
 * import — a phone has no room for more. */
export function createPdfService(send: (response: PdfResponse, transfer?: Transferable[]) => void) {
  const docs = new Map<number, PdfDocument>()
  const running = new Map<number, AbortController>()

  function document(id: number): PdfDocument {
    const doc = docs.get(id)
    if (!doc) throw new Error('That PDF is not open.')
    return doc
  }

  // Renders are the one request that piles up (every page turn and every
  // resize asks for one) and each costs tens of milliseconds and megabytes.
  // So they wait in a queue of their own, one at a time, with a gap between
  // them for a cancel to get through: a render whose page has since been
  // asked for again, or cancelled, is dropped without being drawn.
  const renderQueue: QueuedRender[] = []
  let drawing = false

  function dropRenders(matches: (request: RenderRequest) => boolean) {
    for (let i = renderQueue.length - 1; i >= 0; i--) {
      const queued = renderQueue[i] as QueuedRender
      if (!matches(queued.request)) continue
      renderQueue.splice(i, 1)
      queued.reject(cancelled())
    }
  }

  function renderLater(request: RenderRequest): Promise<RenderedPage> {
    dropRenders((older) => older.doc === request.doc && older.page === request.page)
    return new Promise((resolve, reject) => {
      renderQueue.push({ request, resolve, reject })
      if (!drawing) void drawQueued()
    })
  }

  async function drawQueued() {
    drawing = true
    try {
      while (renderQueue.length > 0) {
        await nextTask() // let cancels and newer requests in first
        const next = renderQueue.shift()
        if (!next) break
        try {
          next.resolve(document(next.request.doc).render(next.request.page, next.request.scale))
        } catch (error) {
          next.reject(error)
        }
      }
    } finally {
      drawing = false
    }
  }

  async function run<T extends PdfRequest>(request: T): Promise<PdfResults[T['type']]> {
    type Result = PdfResults[T['type']]
    switch (request.type) {
      case 'parse': {
        const controller = new AbortController()
        running.set(request.id, controller)
        try {
          const doc = await openPdf(new Uint8Array(request.data))
          try {
            return (await extractPdf(doc, request.fileName, {
              signal: controller.signal,
              onProgress: ({ fraction, message }) =>
                send({ id: request.id, type: 'progress', fraction, message }),
            })) as Result
          } finally {
            doc.close()
          }
        } finally {
          running.delete(request.id)
        }
      }
      case 'open': {
        const doc = await openPdf(new Uint8Array(request.data))
        docs.set(request.doc, doc)
        return { pageCount: doc.pageCount } as Result
      }
      case 'pageSize':
        return document(request.doc).pageSize(request.page) as Result
      case 'render':
        return (await renderLater(request)) as Result
      case 'lines':
        return document(request.doc).lines(request.page) as Result
      case 'close':
        dropRenders((queued) => queued.doc === request.doc)
        docs.get(request.doc)?.close()
        docs.delete(request.doc)
        return null as Result
      case 'cancel':
        running.get(request.target)?.abort()
        dropRenders((queued) => queued.id === request.target)
        return null as Result
    }
  }

  return async function handle(request: PdfRequest): Promise<void> {
    try {
      const result = await run(request)
      const transfer =
        request.type === 'render' ? [(result as PdfResults['render']).rgba.buffer] : undefined
      send({ id: request.id, type: 'done', result }, transfer)
    } catch (error) {
      send({ id: request.id, type: 'error', ...describeError(error) })
    }
  }
}
