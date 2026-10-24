import { useEffect, useState } from 'react'
import { logError } from '@/lib/error-log'
import { DEFAULT_WPM } from '@/core/pacing'
import type { Token } from '@/core/types'
import { loadBook, touchOpened, type BookRecord } from '@/features/reader/api/book'
import { useAppStore } from '@/stores/app-store'

export interface LoadedBook {
  book: BookRecord
  tokens: Token[]
  startIndex: number
  startWpm: number
}

export type LoadedBookState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; loaded: LoadedBook }

/** Load a book, its tokens and where the reader left off. Sets the reading
 * mode the book was last left in before reporting `ready`, so the reader
 * never flashes the wrong mode. */
export function useLoadedBook(bookId: string | undefined): LoadedBookState {
  const [state, setState] = useState<LoadedBookState>({ status: 'loading' })

  useEffect(() => {
    const id = Number(bookId)
    if (!Number.isFinite(id)) {
      setState({ status: 'error', message: 'Invalid book.' })
      return
    }
    setState({ status: 'loading' })
    let cancelled = false
    void (async () => {
      try {
        const { book, tokens, progress } = await loadBook(id)
        if (cancelled) return
        if (!book || !tokens) {
          setState({
            status: 'error',
            message: 'This book could not be found. It may have been removed.',
          })
          return
        }
        // Only a "last opened" stamp: not worth failing the open over.
        touchOpened(id).catch(() => {})
        useAppStore.getState().setMode(progress?.mode ?? 'rsvp')
        setState({
          status: 'ready',
          loaded: {
            book,
            tokens,
            startIndex: progress?.wordIndex ?? 0,
            startWpm: progress?.wpm ?? DEFAULT_WPM,
          },
        })
      } catch (err) {
        logError('open book', err)
        if (!cancelled) setState({ status: 'error', message: 'This book could not be opened.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId])

  return state
}
