import { describe, expect, it } from 'vitest'
import { compareHlc, MAX_SKEW_MS, receive, tick } from '@/core/sync/hlc'

describe('tick', () => {
  it('takes the wall time when it has moved on', () => {
    const first = tick(null, 1000, 'a')
    expect(first).toEqual({ wall: 1000, count: 0, device: 'a' })
    expect(tick(first, 2000, 'a')).toEqual({ wall: 2000, count: 0, device: 'a' })
  })

  it('still moves forward when the wall clock stands still or goes back', () => {
    const first = tick(null, 1000, 'a')
    const second = tick(first, 1000, 'a')
    const third = tick(second, 500, 'a')
    expect(compareHlc(second, first)).toBeGreaterThan(0)
    expect(compareHlc(third, second)).toBeGreaterThan(0)
  })
})

describe('receive', () => {
  it('moves the clock past a later remote time, so the next local event follows it', () => {
    const local = tick(null, 1000, 'a')
    const remote = { wall: 5000, count: 3, device: 'b' }
    const { clock, skewed } = receive(local, remote, 1000, 'a')
    expect(skewed).toBe(false)
    expect(compareHlc(tick(clock, 1000, 'a'), remote)).toBeGreaterThan(0)
  })

  it('keeps the clock for an earlier remote time', () => {
    const local = tick(null, 9000, 'a')
    expect(receive(local, { wall: 1, count: 0, device: 'b' }, 9000, 'a').clock).toBe(local)
  })

  it('does not follow a remote clock running more than a day fast', () => {
    const local = tick(null, 1000, 'a')
    const remote = { wall: 1000 + MAX_SKEW_MS + 1, count: 0, device: 'b' }
    expect(receive(local, remote, 1000, 'a')).toEqual({ clock: local, skewed: true })
  })
})

describe('compareHlc', () => {
  it('breaks a tie by device', () => {
    const a = { wall: 1, count: 0, device: 'a' }
    const b = { wall: 1, count: 0, device: 'b' }
    expect(compareHlc(a, b)).toBeLessThan(0)
    expect(compareHlc(b, a)).toBeGreaterThan(0)
    expect(compareHlc(a, { ...a })).toBe(0)
  })
})
