import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { BookmarkButton } from '@/features/reader/components/BookmarkButton'
import { EngineProvider } from '@/features/reader/engine-context'
import { bookmarksOf } from '@/storage/bookmarks'
import { getDb } from '@/storage/schema'

const db = getDb()

beforeEach(async () => {
  await db.bookmarks.clear()
})

describe('BookmarkButton', () => {
  it('marks the word being read, shows it marked there only, and unmarks it', async () => {
    const engine = createEngine(
      ['Call', 'me', 'Ishmael.', 'Some', 'years'].map((w) => makeToken(w)),
    )
    act(() => engine.seek(1))
    render(
      <EngineProvider value={engine}>
        <BookmarkButton bookId={7} />
      </EngineProvider>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Add bookmark' }))
    const marked = await screen.findByRole('button', { name: 'Remove bookmark' })
    expect(marked).toHaveAttribute('aria-pressed', 'true')
    expect(await bookmarksOf(db, 7)).toMatchObject([
      { wordIndex: 1, excerpt: 'me Ishmael. Some years' },
    ])

    act(() => engine.seek(3))
    expect(screen.getByRole('button', { name: 'Add bookmark' })).toBeInTheDocument()
    act(() => engine.seek(1))
    await user.click(screen.getByRole('button', { name: 'Remove bookmark' }))
    expect(await screen.findByRole('button', { name: 'Add bookmark' })).toBeInTheDocument()
    expect(await bookmarksOf(db, 7)).toEqual([])
  })
})
