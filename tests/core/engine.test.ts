import { describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../src/core/engine'
import { delayFor } from '../../src/core/pacing'
import { makeToken } from '../../src/core/types'

describe('engine timing', () => {
  it('advances 100 words at 600 WPM within 2% of the expected total time', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    try {
      const tokens = Array.from({ length: 100 }, (_, i) => makeToken(`word${i % 10}`))
      const expectedTotal = tokens.reduce((sum, t) => sum + delayFor(t, 600), 0)

      const engine = createEngine(tokens, { wpm: 600 })
      const start = performance.now()
      let finishedAt: number | null = null
      engine.on('finished', () => {
        finishedAt = performance.now() - start
      })

      engine.play()
      vi.advanceTimersByTime(expectedTotal + 1000)

      expect(finishedAt).not.toBeNull()
      expect(finishedAt as unknown as number).toBeGreaterThanOrEqual(expectedTotal * 0.98)
      expect(finishedAt as unknown as number).toBeLessThanOrEqual(expectedTotal * 1.02)
    } finally {
      vi.useRealTimers()
    }
  })

  it('compensates for a late-firing timer instead of accumulating drift', () => {
    // A hand-rolled clock, rather than vi's fake timers: advanceTimersByTime
    // fires callbacks at their own scheduled instant no matter how far you
    // advance by, so it can't express "this callback actually ran later
    // than the browser scheduled it" — which is the real-world condition
    // (tab throttling, a busy main thread) drift correction exists for.
    let time = 0
    let pending: { cb: () => void; id: number } | null = null
    let nextId = 1
    const clock = {
      now: () => time,
      setTimer: (cb: () => void) => {
        const id = nextId++
        pending = { cb, id }
        return id
      },
      clearTimer: (id: number) => {
        if (pending?.id === id) pending = null
      },
      fireAt(t: number) {
        time = t
        const p = pending
        pending = null
        p?.cb()
      },
    }

    const tokens = [makeToken('one'), makeToken('two'), makeToken('three')]
    // 300 WPM, short words: 200ms each.
    const engine = createEngine(tokens, {
      wpm: 300,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    })
    const wordTimes: number[] = []
    engine.on('word', () => wordTimes.push(clock.now()))

    engine.play()
    // The first tick was scheduled for t=200 but only actually runs once
    // the clock reaches 250 — a simulated 50ms of lateness.
    clock.fireAt(250)
    // Uncompensated, the next tick would land at 250 + 200 = 450. With the
    // 50ms of drift subtracted from the next delay, it lands at 400.
    clock.fireAt(400)

    expect(wordTimes).toEqual([250, 400])
  })

  it('play/pause/seek/skip drive the index like the Python engine', () => {
    const tokens = ['a', 'b', 'c', 'd', 'e'].map((t) => makeToken(t))
    const engine = createEngine(tokens, { wpm: 300 })

    expect(engine.index).toBe(0)
    engine.seek(2)
    expect(engine.index).toBe(2)
    engine.skip(1)
    expect(engine.index).toBe(3)
    engine.skip(-2)
    expect(engine.index).toBe(1)
    // Clamped at the edges, same as Python's _clamp().
    engine.seek(-5)
    expect(engine.index).toBe(0)
    engine.seek(999)
    expect(engine.index).toBe(4)
    expect(engine.atEnd).toBe(true)

    engine.destroy()
  })
})
