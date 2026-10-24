import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { EngineProvider } from '@/features/reader/engine-context'
import { useAutosaveProgress } from '@/features/reader/hooks/useAutosaveProgress'
import type { ReadingMode } from '@/stores/app-store'

const saveProgress = vi.fn()
vi.mock('@/features/reader/api/book', () => ({
  saveProgress: (...args: unknown[]) => saveProgress(...args),
}))

beforeEach(() => saveProgress.mockReset())

function setup(mode: ReadingMode) {
  const engine = createEngine(
    Array.from({ length: 100 }, (_, i) => makeToken(`w${i}`)),
    { setTimer: () => 0, clearTimer: () => {} },
  )
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EngineProvider value={engine}>{children}</EngineProvider>
  )
  const hook = renderHook(({ mode }) => useAutosaveProgress(1, mode), {
    wrapper,
    initialProps: { mode },
  })
  return { engine, ...hook }
}

const lastSaved = () => saveProgress.mock.calls.at(-1)?.[1]

describe('useAutosaveProgress', () => {
  it('saves the mode being switched to, never the one being left', () => {
    // A save made while switching must not be stale: if the app is closed
    // before the next save lands, that one is what the book reopens with.
    const { engine, rerender } = setup('rsvp')
    engine.seek(5)
    rerender({ mode: 'book' })
    expect(lastSaved()).toMatchObject({ mode: 'book', wordIndex: 5 })
    engine.seek(7)
    rerender({ mode: 'rsvp' })
    expect(lastSaved()).toMatchObject({ mode: 'rsvp', wordIndex: 7 })
  })

  it('saves on pause, and every 20 words', () => {
    const { engine } = setup('rsvp')
    engine.seek(10)
    expect(saveProgress).not.toHaveBeenCalled()
    engine.seek(25)
    expect(lastSaved()).toMatchObject({ wordIndex: 25 })
    engine.play()
    engine.pause()
    expect(saveProgress).toHaveBeenCalledTimes(2)
  })

  it('saves the current place when the reader closes', () => {
    const { engine, unmount } = setup('book')
    engine.seek(3)
    unmount()
    expect(lastSaved()).toMatchObject({ mode: 'book', wordIndex: 3 })
  })
})
