import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  addBookmark,
  bookmarksOf,
  removeBookmark,
  type BookmarkRecord,
} from '@/features/reader/api/book'
import { bookmarkExcerpt } from '@/features/reader/bookmark'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'
import { logError } from '@/lib/error-log'

/** Marks the word being read, or unmarks it if it already is. */
export function BookmarkButton({ bookId }: { bookId: number }) {
  const engine = useEngine()
  const index = useEngineIndex()
  const [marks, setMarks] = useState<BookmarkRecord[]>([])

  useEffect(() => {
    let cancelled = false
    bookmarksOf(bookId)
      .then((list) => !cancelled && setMarks(list))
      .catch((err) => logError('load bookmarks', err))
    return () => {
      cancelled = true
    }
  }, [bookId])

  const here = marks.find((m) => m.wordIndex === index)

  async function toggle() {
    try {
      if (here) await removeBookmark(here.id as number)
      else await addBookmark(bookId, index, bookmarkExcerpt(engine.tokens, index))
      setMarks(await bookmarksOf(bookId))
    } catch (err) {
      logError('bookmark', err)
    }
  }

  return (
    <button
      type="button"
      aria-label={here ? 'Remove bookmark' : 'Add bookmark'}
      aria-pressed={here !== undefined}
      title={here ? 'Remove the bookmark on this word' : 'Bookmark this word'}
      onClick={() => void toggle()}
      className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-bg-hover ${
        here ? 'text-accent' : 'text-text-dim hover:text-text'
      }`}
    >
      <Icon name="bookmark" size={17} />
    </button>
  )
}
