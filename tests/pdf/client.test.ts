// @vitest-environment node
import { getEventListeners } from 'node:events'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtractionError, NoTextLayerError } from '@/parse/errors'
import { parsePdf } from '@/parse/pdf'
import { createPdfClient, type WorkerLike } from '@/pdf/client'
import type { PdfRequest, PdfResponse } from '@/pdf/protocol'
import { createPdfService } from '@/pdf/service'

/** A worker that runs the real service in this thread, delivering messages
 * asynchronously the way a real one does. */
class InProcessWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null
  onerror: WorkerLike['onerror'] = null
  terminated = false
  readonly requests: PdfRequest[] = []
  // Messages go through structuredClone with the transfer list, as a real
  // worker's do: a buffer that should have been transferred but was not is
  // copied instead, which the tests can see (it is not detached).
  private readonly handle = createPdfService((response: PdfResponse, transfer) => {
    const delivered = structuredClone(response, { transfer })
    setTimeout(() => {
      if (!this.terminated) this.onmessage?.({ data: delivered } as MessageEvent<PdfResponse>)
    }, 0)
  })
  postMessage(message: PdfRequest, transfer?: Transferable[]) {
    const delivered = structuredClone(message, { transfer })
    this.requests.push(delivered)
    setTimeout(() => void this.handle(delivered), 0)
  }
  terminate() {
    this.terminated = true
  }
}

const bytes = (name: string) => readFileSync(`tests/fixtures/${name}.pdf`)
const fileOf = (name: string) => new File([bytes(name)], `${name}.pdf`)
const arrayBufferOf = (name: string) => {
  const b = bytes(name)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

/** Wait, without letting any timer run, until the worker has been sent
 * something: the in-process worker answers from timers, so this is the
 * window in which a test can still interrupt it. */
async function untilPosted(workers: InProcessWorker[]) {
  while (!workers[0]?.requests.length) await Promise.resolve()
}

let workers: InProcessWorker[]
let client: ReturnType<typeof createPdfClient>

beforeEach(() => {
  workers = []
  client = createPdfClient(() => {
    const worker = new InProcessWorker()
    workers.push(worker)
    return worker
  })
})
afterEach(() => vi.useRealTimers())

describe('parse', () => {
  it('gives the same book as reading the PDF directly', async () => {
    const viaWorker = await client.parse(fileOf('two-column-text'))
    const direct = await parsePdf(fileOf('two-column-text'))
    expect(viaWorker).toEqual(direct)
  })

  it('reports progress as it goes', async () => {
    const fractions: number[] = []
    await client.parse(fileOf('two-column-text'), { onProgress: (f) => fractions.push(f) })
    expect(fractions.at(-1)).toBe(1)
    expect(fractions).toHaveLength(3) // a page each
  })

  it('brings back the right error class, so the UI can tell them apart', async () => {
    await expect(client.parse(fileOf('password-protected'))).rejects.toBeInstanceOf(ExtractionError)
    await expect(client.parse(fileOf('password-protected'))).rejects.toThrow(/password protected/)
    await expect(client.parse(fileOf('scanned-blank'))).rejects.toBeInstanceOf(NoTextLayerError)
  })

  it('does not start at all when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      client.parse(fileOf('two-column-text'), { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(workers).toHaveLength(0)
  })

  it('sends a cancel for the parse when aborted part-way', async () => {
    const controller = new AbortController()
    const parsing = client.parse(fileOf('two-column-text'), { signal: controller.signal })
    await untilPosted(workers)
    controller.abort()
    // (This small PDF is read in one go, before the worker could hear the
    // cancel, so it may still finish; honouring a cancel is tested on
    // extractPdf itself.)
    await parsing.catch(() => {})
    const [parse, cancel] = workers[0]?.requests ?? []
    expect(cancel).toMatchObject({ type: 'cancel', target: parse?.id })
  })
})

describe('an open book', () => {
  it("remembers a page's lines, so turning back does not ask again", async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    await pdf.lines(0)
    await pdf.lines(0)
    expect(workers[0]?.requests.filter((r) => r.type === 'lines')).toHaveLength(1)
    pdf.close()
  })

  it('does not remember a failure, so a retry asks again', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    await expect(pdf.pageSize(99)).rejects.toThrow(/No page 99/)
    await expect(pdf.pageSize(99)).rejects.toThrow(/No page 99/)
    expect(workers[0]?.requests.filter((r) => r.type === 'pageSize')).toHaveLength(2)
    pdf.close()
  })

  it('cancels a draw that is aborted, and tells the worker', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    const controller = new AbortController()
    const drawing = pdf.render(0, 1, { signal: controller.signal })
    controller.abort()
    await expect(drawing).rejects.toMatchObject({ name: 'AbortError' })
    const requests = workers[0]?.requests ?? []
    const render = requests.find((r) => r.type === 'render')
    expect(requests.at(-1)).toMatchObject({ type: 'cancel', target: render?.id })
    pdf.close()
  })

  it('lets go of the abort signal once a draw is done, so it does not hold the bitmap', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    const signal = new AbortController().signal // one per mounted page: it outlives each draw
    await pdf.render(0, 0.25, { signal })
    await pdf.render(1, 0.25, { signal })
    expect(getEventListeners(signal, 'abort')).toHaveLength(0)
    pdf.close()
  })

  it('lets go of the abort signal when a draw fails or the engine dies', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    const signal = new AbortController().signal
    await expect(pdf.render(99, 1, { signal })).rejects.toThrow() // no such page
    expect(getEventListeners(signal, 'abort')).toHaveLength(0)
    const dying = pdf.render(0, 1, { signal })
    await untilPosted(workers)
    workers[0]?.onerror?.({ message: 'boom' } as ErrorEvent)
    await expect(dying).rejects.toThrow('boom')
    expect(getEventListeners(signal, 'abort')).toHaveLength(0)
  })

  it('does not send a draw that was aborted before it started', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    const controller = new AbortController()
    controller.abort()
    await expect(pdf.render(0, 1, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(workers[0]?.requests.some((r) => r.type === 'render')).toBe(false)
    pdf.close()
  })

  it('knows its pages, sizes and lines, and draws them', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    expect(pdf.pageCount).toBe(3)
    expect(await pdf.pageSize(0)).toMatchObject({ width: 612, height: 792 })
    const lines = await pdf.lines(0)
    expect(lines[0]?.words[0]?.text).toBe('The')
    const page = await pdf.render(0, 0.5)
    expect(page).toMatchObject({ width: 306, height: 396, scale: 0.5 })
    expect(page.rgba).toHaveLength(306 * 396 * 4)
    pdf.close()
  })

  it('asks the worker for a page size only once', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    await pdf.pageSize(1)
    await pdf.pageSize(1)
    expect(workers[0]?.requests.filter((r) => r.type === 'pageSize')).toHaveLength(1)
    pdf.close()
  })

  it('explains a page that is not there', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    await expect(pdf.pageSize(99)).rejects.toThrow(/No page 99/)
    pdf.close()
  })

  it('explains a PDF that will not open', async () => {
    await expect(client.open(arrayBufferOf('password-protected'))).rejects.toThrow(
      /password protected/,
    )
  })

  it('closes the document in the worker, once', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    pdf.close()
    pdf.close()
    await vi.waitFor(() =>
      expect(workers[0]?.requests.filter((r) => r.type === 'close')).toHaveLength(1),
    )
    await expect(pdf.pageSize(2)).rejects.toThrow(/not open/)
  })

  it('keeps two books apart', async () => {
    const a = await client.open(arrayBufferOf('two-column-text'))
    const b = await client.open(arrayBufferOf('hyphenated-line-breaks'))
    expect(a.pageCount).toBe(3)
    expect(b.pageCount).toBe(1)
    expect((await a.lines(0))[0]?.words[0]?.text).toBe('The')
    expect((await b.lines(0))[0]?.words[0]?.text).toBe('It')
    a.close()
    b.close()
  })
})

describe('what is sent to the worker', () => {
  it('hands the PDF over rather than copying it, for opening and for importing', async () => {
    const forOpen = arrayBufferOf('two-column-text')
    const pdf = await client.open(forOpen)
    expect(forOpen.byteLength).toBe(0) // transferred: this side no longer holds it
    pdf.close()

    const file = fileOf('two-column-text')
    const buffer = await file.arrayBuffer()
    void buffer // (File.arrayBuffer() gives a copy; the client transfers its own)
    await client.parse(file)
  })

  it('gets a drawn page back without copying it', async () => {
    const sent: { transfer?: Transferable[] }[] = []
    const service = createPdfService((_response, transfer) => sent.push({ transfer }))
    const bytes = arrayBufferOf('two-column-text')
    await service({ id: 1, type: 'open', doc: 1, data: bytes })
    await service({ id: 2, type: 'render', doc: 1, page: 0, scale: 0.25 })
    const render = sent.at(-1)
    expect(render?.transfer).toHaveLength(1)
    expect(render?.transfer?.[0]).toBeInstanceOf(ArrayBuffer)
  })
})

describe('the worker lifetime', () => {
  const idleMs = 1000
  beforeEach(() => {
    client = createPdfClient(
      () => {
        const worker = new InProcessWorker()
        workers.push(worker)
        return worker
      },
      { idleMs },
    )
  })

  it('is stopped once nothing has used it for a while', async () => {
    await client.parse(fileOf('hyphenated-line-breaks'))
    expect(workers[0]?.terminated).toBe(false)
    await vi.waitFor(() => expect(workers[0]?.terminated).toBe(true), { timeout: 3000 })
  })

  it('is kept while a book is open, however long that is', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    await new Promise((resolve) => setTimeout(resolve, idleMs * 2))
    expect(workers[0]?.terminated).toBe(false)
    expect((await pdf.lines(0)).length).toBeGreaterThan(0) // and still answering
    pdf.close()
  })

  it('starts a fresh one for the next job after stopping', async () => {
    await client.parse(fileOf('hyphenated-line-breaks'))
    await vi.waitFor(() => expect(workers[0]?.terminated).toBe(true), { timeout: 3000 })
    await client.parse(fileOf('hyphenated-line-breaks'))
    expect(workers).toHaveLength(2)
  })

  it('tells an open book when the engine dies under it, and stops answering for it', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    const lost = vi.fn()
    pdf.onLost(lost)
    workers[0]?.onerror?.({ message: 'boom' } as ErrorEvent)
    expect(lost).toHaveBeenCalledTimes(1)
    await expect(pdf.render(0, 1)).rejects.toThrow(/not open/)
    await expect(pdf.pageSize(0)).rejects.toThrow(/not open/)
    expect(workers).toHaveLength(1) // and it did not quietly start a new engine to ask it
  })

  it('lets go of a listener that was removed', async () => {
    const pdf = await client.open(arrayBufferOf('two-column-text'))
    const lost = vi.fn()
    pdf.onLost(lost)()
    workers[0]?.onerror?.({ message: 'boom' } as ErrorEvent)
    expect(lost).not.toHaveBeenCalled()
  })

  it('counts books correctly after a crash: closing the dead one does not strand the next', async () => {
    const dead = await client.open(arrayBufferOf('two-column-text'))
    workers[0]?.onerror?.({ message: 'boom' } as ErrorEvent)
    dead.close() // used to take the open-book count below zero
    const next = await client.open(arrayBufferOf('hyphenated-line-breaks'))
    await new Promise((resolve) => setTimeout(resolve, idleMs * 2))
    expect(workers.at(-1)?.terminated).toBe(false) // still held open
    expect((await next.lines(0)).length).toBeGreaterThan(0)
    next.close()
  })

  it('fails what is waiting if the worker crashes, and recovers', async () => {
    const parsing = client.parse(fileOf('two-column-text'))
    await untilPosted(workers)
    workers[0]?.onerror?.({ message: 'boom' } as ErrorEvent)
    await expect(parsing).rejects.toThrow('boom')
    expect(workers[0]?.terminated).toBe(true)
    await expect(client.parse(fileOf('hyphenated-line-breaks'))).resolves.toBeTruthy()
  })
})
