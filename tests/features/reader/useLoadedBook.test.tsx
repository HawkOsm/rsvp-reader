import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeToken } from '@/core/types'
import { addBook, saveProgress, saveTokens } from '@/storage/library'
import { getDb } from '@/storage/schema'
import { useLoadedBook } from '@/features/reader/hooks/useLoadedBook'
import { useAppStore } from '@/stores/app-store'
import { TEXT_BOOK } from '../../storage/fixtures'

const db = getDb()

beforeEach(async () => {
  await Promise.all([db.books.clear(), db.tokens.clear(), db.progress.clear()])
  useAppStore.setState({ mode: 'rsvp' })
})

async function seedBook(fingerprint: string) {
  const book = await addBook(db, { title: 'T', source: 'local', fingerprint, ...TEXT_BOOK })
  const id = book.id as number
  await saveTokens(db, id, [makeToken('one'), makeToken('two'), makeToken('three')], fingerprint)
  return id
}

afterEach(() => vi.restoreAllMocks())

describe('useLoadedBook', () => {
  it('starts out loading', () => {
    const { result } = renderHook(() => useLoadedBook('1'))
    expect(result.current.status).toBe('loading')
  })

  it.each([undefined, 'abc'])('reports %s as an invalid book', async (bookId) => {
    const { result } = renderHook(() => useLoadedBook(bookId))
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'error', message: 'Invalid book.' }),
    )
  })

  it('reports a book that is not in the library', async () => {
    const { result } = renderHook(() => useLoadedBook('999'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toMatchObject({ message: expect.stringContaining('could not be found') })
  })

  it('loads the book with defaults when it has never been read', async () => {
    const id = await seedBook('fresh')
    const { result } = renderHook(() => useLoadedBook(String(id)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('unreachable')
    expect(result.current.loaded.tokens).toHaveLength(3)
    expect(result.current.loaded).toMatchObject({ startIndex: 0, startWpm: 300 })
    expect(useAppStore.getState().mode).toBe('rsvp')
  })

  it('resumes where the reader left off, in the mode they left it', async () => {
    const id = await seedBook('resume')
    await saveProgress(db, id, { wordIndex: 2, wpm: 450, mode: 'book' })
    const { result } = renderHook(() => useLoadedBook(String(id)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toMatchObject({ loaded: { startIndex: 2, startWpm: 450 } })
    expect(useAppStore.getState().mode).toBe('book')
  })

  it('opens at the word a bookmark link names, keeping the saved speed and mode', async () => {
    const id = await seedBook('at')
    await saveProgress(db, id, { wordIndex: 0, wpm: 450, mode: 'book' })
    const { result } = renderHook(() => useLoadedBook(String(id), '1'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toMatchObject({ loaded: { startIndex: 1, startWpm: 450 } })
    expect(useAppStore.getState().mode).toBe('book')
  })

  it('does not load the book again when `at` leaves the address', async () => {
    const id = await seedBook('at-gone')
    const { result, rerender } = renderHook(({ at }) => useLoadedBook(String(id), at), {
      initialProps: { at: '2' as string | null },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const loaded = result.current
    rerender({ at: null })
    expect(result.current).toBe(loaded)
    expect(result.current).toMatchObject({ loaded: { startIndex: 2 } })
  })

  it('marks the book as opened', async () => {
    const id = await seedBook('opened')
    const { result } = renderHook(() => useLoadedBook(String(id)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(async () => expect((await db.books.get(id))?.lastOpenedAt).not.toBeNull())
  })

  it('loads the new book when the id changes, and clears an earlier error', async () => {
    const id = await seedBook('switch')
    const { result, rerender } = renderHook(({ bookId }) => useLoadedBook(bookId), {
      initialProps: { bookId: '999' },
    })
    await waitFor(() => expect(result.current.status).toBe('error'))
    rerender({ bookId: String(id) })
    expect(result.current.status).toBe('loading') // not the old error, nor yet the new book
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('reports a book whose tokens are missing', async () => {
    const book = await addBook(db, {
      title: 'T',
      source: 'local',
      fingerprint: 'no-tokens',
      ...TEXT_BOOK,
    })
    const { result } = renderHook(() => useLoadedBook(String(book.id)))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('reports a failed load instead of staying on loading forever', async () => {
    const id = await seedBook('broken')
    vi.spyOn(db.books, 'get').mockRejectedValueOnce(new Error('db broke'))
    const { result } = renderHook(() => useLoadedBook(String(id)))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toMatchObject({ message: 'This book could not be opened.' })
  })

  it('does nothing once unmounted, so it cannot change the reading mode late', async () => {
    const id = await seedBook('unmount')
    await saveProgress(db, id, { wordIndex: 0, wpm: 300, mode: 'book' })
    const { unmount } = renderHook(() => useLoadedBook(String(id)))
    unmount()
    await db.books.get(id) // let the abandoned load finish
    await db.progress.get(id)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(useAppStore.getState().mode).toBe('rsvp')
  })
})
