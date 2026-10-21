// @vitest-environment node
import { readFileSync } from 'node:fs'
import * as mupdf from 'mupdf'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfRequest, PdfResponse } from '../../src/pdf/protocol'
import { createPdfService } from '../../src/pdf/service'

const bytes = (name = 'two-column-text') => {
  const b = readFileSync(`tests/fixtures/${name}.pdf`)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

function setup() {
  const responses: PdfResponse[] = []
  const handle = createPdfService((response) => responses.push(response))
  let id = 100
  const request = <T extends PdfRequest['type']>(
    type: T,
    fields: Omit<Extract<PdfRequest, { type: T }>, 'id' | 'type'>,
  ) => {
    const message = { id: id++, type, ...fields } as unknown as PdfRequest
    return { id: message.id, done: handle(message) }
  }
  const answer = (id: number) => responses.find((r) => r.id === id && r.type !== 'progress')
  return { responses, request, answer }
}

describe('drawing pages', () => {
  it('draws a page it is asked for', async () => {
    const { request, answer } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    const draw = request('render', { doc: 1, page: 0, scale: 0.5 })
    await draw.done
    expect(answer(draw.id)).toMatchObject({ type: 'done', result: { width: 306, height: 396 } })
  })

  it('draws only the latest request for a page, dropping an older one that has not started', async () => {
    const { request, answer } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    // A resize drags: three scales for the same page, back to back.
    const a = request('render', { doc: 1, page: 0, scale: 0.5 })
    const b = request('render', { doc: 1, page: 0, scale: 0.75 })
    const c = request('render', { doc: 1, page: 0, scale: 1 })
    await Promise.all([a.done, b.done, c.done])
    expect(answer(a.id)).toMatchObject({ type: 'error', kind: 'aborted' })
    expect(answer(b.id)).toMatchObject({ type: 'error', kind: 'aborted' })
    expect(answer(c.id)).toMatchObject({ type: 'done', result: { scale: 1 } })
  })

  it('keeps drawing after the queue has emptied, not just the first batch', async () => {
    const { request, answer } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    for (const page of [0, 1, 2, 0]) {
      const draw = request('render', { doc: 1, page, scale: 0.25 })
      await draw.done // the queue is empty again before the next one
      expect(answer(draw.id)).toMatchObject({ type: 'done' })
    }
  })

  it('keeps draws of different pages', async () => {
    const { request, answer } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    const a = request('render', { doc: 1, page: 0, scale: 0.25 })
    const b = request('render', { doc: 1, page: 1, scale: 0.25 })
    await Promise.all([a.done, b.done])
    expect(answer(a.id)?.type).toBe('done')
    expect(answer(b.id)?.type).toBe('done')
  })

  it('draws one at a time, in the order asked', async () => {
    const { request, responses } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    const jobs = [0, 1, 2].map((page) => request('render', { doc: 1, page, scale: 0.25 }))
    await Promise.all(jobs.map((j) => j.done))
    const order = responses.filter((r) => r.type === 'done' && jobs.some((j) => j.id === r.id)).map((r) => r.id)
    expect(order).toEqual(jobs.map((j) => j.id))
  })

  it('drops a draw that is cancelled before it starts', async () => {
    const { request, answer } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    const draw = request('render', { doc: 1, page: 2, scale: 1 })
    const cancel = request('cancel', { target: draw.id })
    await Promise.all([draw.done, cancel.done])
    expect(answer(draw.id)).toMatchObject({ type: 'error', kind: 'aborted' })
  })

  it('drops queued draws when the book is closed, and does not draw into a closed book', async () => {
    const { request, answer } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    const draw = request('render', { doc: 1, page: 0, scale: 1 })
    const close = request('close', { doc: 1 })
    await Promise.all([draw.done, close.done])
    expect(answer(draw.id)).toMatchObject({ type: 'error', kind: 'aborted' })
    expect(answer(close.id)).toMatchObject({ type: 'done' })
  })

  it('says so for a book that is not open', async () => {
    const { request, answer } = setup()
    const draw = request('render', { doc: 9, page: 0, scale: 1 })
    await draw.done
    expect(answer(draw.id)).toMatchObject({ type: 'error', message: expect.stringMatching(/not open/) })
  })
})

describe('freeing documents', () => {
  afterEach(() => vi.restoreAllMocks())
  const destroys = () => vi.spyOn(mupdf.PDFDocument.prototype, 'destroy')

  it('frees a book when it is closed', async () => {
    const { request } = setup()
    await request('open', { doc: 1, data: bytes() }).done
    const destroy = destroys()
    await request('close', { doc: 1 }).done
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('frees the document after an import, whether it worked or not', async () => {
    const { request } = setup()
    const destroy = destroys()
    await request('parse', { fileName: 'a.pdf', data: bytes() }).done // reads fine
    expect(destroy).toHaveBeenCalledTimes(1)
    await request('parse', { fileName: 'scan.pdf', data: bytes('scanned-blank') }).done // no text
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('does not keep the import cancel handle of a PDF that would not open', async () => {
    const { request, answer } = setup()
    const failing = request('parse', { fileName: 'locked.pdf', data: bytes('password-protected') })
    await failing.done
    expect(answer(failing.id)).toMatchObject({ type: 'error', kind: 'extraction' })
    // a cancel for it afterwards is harmless, not an error
    const cancel = request('cancel', { target: failing.id })
    await cancel.done
    expect(answer(cancel.id)).toMatchObject({ type: 'done' })
  })
})
