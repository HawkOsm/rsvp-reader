import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { PositionOffer } from '@/features/reader/components/PositionOffer'
import { EngineProvider } from '@/features/reader/engine-context'
import { flags } from '@/lib/flags'
import { saveSeenDevices } from '@/lib/sync-runs'
import { addBook, getProgress } from '@/storage/library'
import { getDb } from '@/storage/schema'
import { localSyncState } from '@/storage/sync-log'
import { TEXT_BOOK } from '../../storage/fixtures'

const db = getDb()
const words = ['It', 'was', 'a', 'dark', 'and', 'stormy', 'night'].map((w) => makeToken(w))
let bookId: number

beforeEach(async () => {
  await Promise.all([db.books.clear(), db.progress.clear(), db.syncRegisters.clear()])
  const book = await addBook(db, {
    title: 'Dark',
    source: 'local',
    fingerprint: `f${Math.random()}`,
    syncId: 'dark',
    ...TEXT_BOOK,
  })
  bookId = book.id as number
  // Another device read on to word 5.
  await db.syncRegisters.put({
    key: 'progress:dark',
    hlc: { wall: Date.now(), count: 0, device: 'phone' },
    change: { kind: 'progress', book: 'dark', value: { wordIndex: 5, wpm: 300, mode: 'rsvp' } },
  })
  saveSeenDevices([{ device: 'phone', name: 'Chrome on Android', lastSeen: 1 }])
})

afterEach(() => flags.setEnabled('sync', false))

function renderOffer() {
  const engine = createEngine(words)
  render(
    <EngineProvider value={engine}>
      <PositionOffer bookId={bookId} layout={{ kind: 'reflow' }} />
    </EngineProvider>,
  )
  return engine
}

describe('PositionOffer', () => {
  it('shows nothing with the sync flag off', async () => {
    renderOffer()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('asks before jumping to another device’s place', async () => {
    flags.setEnabled('sync', true)
    const engine = renderOffer()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Chrome on Android is 5 words further on. Jump there?',
    )
    expect(engine.index).toBe(0)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Jump there' }))
    expect(engine.index).toBe(5)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await waitFor(async () => expect(await getProgress(db, bookId)).toMatchObject({ wordIndex: 5 }))
  })

  it('staying makes this device’s place the newer one', async () => {
    flags.setEnabled('sync', true)
    renderOffer()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Stay here' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const { device } = await localSyncState(db)
    await waitFor(async () =>
      expect(await db.syncRegisters.get('progress:dark')).toMatchObject({
        hlc: { device },
        change: { value: { wordIndex: 0 } },
        pending: 1,
      }),
    )
  })
})
