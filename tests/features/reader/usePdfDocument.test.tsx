import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfHandle } from '@/pdf/client'
import { usePdfDocument } from '@/features/reader/hooks/usePdfDocument'

const open = vi.fn<(data: ArrayBuffer) => Promise<PdfHandle>>()
const loadFile = vi.fn<(db: unknown, id: number) => Promise<{ blob: Blob } | undefined>>()
vi.mock('@/pdf/client', () => ({ pdfClient: { open: (d: ArrayBuffer) => open(d) } }))
vi.mock('@/storage/files', () => ({ loadFile: (db: unknown, id: number) => loadFile(db, id) }))

/** A handle that can be told its engine died. */
function fakeHandle() {
  const listeners = new Set<() => void>()
  const handle = {
    pageCount: 3,
    close: vi.fn(),
    onLost: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  } as unknown as PdfHandle
  return { handle, lose: () => [...listeners].forEach((l) => l()), listeners }
}

let handles: ReturnType<typeof fakeHandle>[]
beforeEach(() => {
  handles = []
  open.mockReset()
  loadFile.mockReset()
  loadFile.mockResolvedValue({ blob: new Blob(['%PDF']) })
  open.mockImplementation(async () => {
    const made = fakeHandle()
    handles.push(made)
    return made.handle
  })
})
afterEach(() => vi.restoreAllMocks())

describe('usePdfDocument', () => {
  it('is null until the book has opened, then the open book', async () => {
    const { result } = renderHook(() => usePdfDocument(1))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(handles[0]?.handle))
  })

  it('stays empty for a book with no stored file', async () => {
    loadFile.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePdfDocument(1))
    await waitFor(() => expect(loadFile).toHaveBeenCalled())
    expect(result.current).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  it('stays empty, quietly, for a PDF that will not open', async () => {
    open.mockRejectedValue(new Error('corrupt'))
    const { result } = renderHook(() => usePdfDocument(1))
    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('closes the book when the reader leaves it', async () => {
    const { result, unmount } = renderHook(() => usePdfDocument(1))
    await waitFor(() => expect(result.current).not.toBeNull())
    unmount()
    expect(handles[0]?.handle.close).toHaveBeenCalledTimes(1)
  })

  it('closes a book that finished opening after the reader had moved on', async () => {
    let finish: (h: PdfHandle) => void = () => {}
    open.mockImplementationOnce(() => new Promise<PdfHandle>((resolve) => (finish = resolve)))
    const { unmount } = renderHook(() => usePdfDocument(1))
    await waitFor(() => expect(open).toHaveBeenCalled())
    unmount()
    const late = fakeHandle()
    finish(late.handle)
    await waitFor(() => expect(late.handle.close).toHaveBeenCalledTimes(1))
  })

  it('opens the other book when the id changes, closing the first', async () => {
    const { result, rerender } = renderHook(({ id }) => usePdfDocument(id), {
      initialProps: { id: 1 },
    })
    await waitFor(() => expect(result.current).toBe(handles[0]?.handle))
    rerender({ id: 2 })
    await waitFor(() => expect(result.current).toBe(handles[1]?.handle))
    expect(handles[0]?.handle.close).toHaveBeenCalledTimes(1)
  })

  describe('when the PDF engine dies under an open book', () => {
    it('opens the book again', async () => {
      const { result } = renderHook(() => usePdfDocument(1))
      await waitFor(() => expect(result.current).toBe(handles[0]?.handle))
      act(() => handles[0]?.lose())
      await waitFor(() => expect(result.current).toBe(handles[1]?.handle))
      expect(open).toHaveBeenCalledTimes(2)
    })

    it('gives up if it keeps dying, rather than loop', async () => {
      const { result } = renderHook(() => usePdfDocument(1))
      for (let n = 0; n < 4; n++) {
        await waitFor(() => expect(result.current).toBe(handles[n]?.handle))
        act(() => handles[n]?.lose())
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(open).toHaveBeenCalledTimes(4) // the first, and three reopens
      expect(result.current).toBeNull()
    })

    it('forgives deaths that were long ago', async () => {
      let now = 1_000_000
      vi.spyOn(Date, 'now').mockImplementation(() => now)
      const { result } = renderHook(() => usePdfDocument(1))
      for (let n = 0; n < 6; n++) {
        await waitFor(() => expect(result.current).toBe(handles[n]?.handle))
        now += 120_000 // each a couple of minutes apart
        act(() => handles[n]?.lose())
      }
      await waitFor(() => expect(result.current).toBe(handles[6]?.handle))
    })

    it('does not reopen a book the reader has already left', async () => {
      const { result, unmount } = renderHook(() => usePdfDocument(1))
      await waitFor(() => expect(result.current).not.toBeNull())
      const first = handles[0]
      unmount()
      first?.lose() // its listener was removed, so this must not reopen anything
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(open).toHaveBeenCalledTimes(1)
      expect(first?.listeners.size).toBe(0)
    })
  })
})
