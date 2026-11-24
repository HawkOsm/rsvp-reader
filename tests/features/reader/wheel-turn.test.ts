import { describe, expect, it } from 'vitest'
import { WHEEL_AT_REST, wheelPixels, wheelTurn } from '@/features/reader/wheel-turn'

describe('turning the page with a wheel', () => {
  it('turns once for one notch of a mouse wheel, forward or back', () => {
    expect(wheelTurn(WHEEL_AT_REST, 100, 0).turn).toBe(1)
    expect(wheelTurn(WHEEL_AT_REST, -100, 0).turn).toBe(-1)
  })

  it('adds up a trackpad’s small movements, and turns one page for the whole flick', () => {
    let run = WHEEL_AT_REST
    const turns: (1 | -1 | null)[] = []
    // Sixty small movements 16 ms apart: a flick and its glide.
    for (let i = 0; i < 60; i++) {
      const step = wheelTurn(run, 6, i * 16)
      run = step.run
      turns.push(step.turn)
    }
    expect(turns.filter((t) => t !== null)).toEqual([1])
    expect(turns.indexOf(1)).toBe(6) // once 40 px had gone by
  })

  it('turns again once the wheel has rested', () => {
    const first = wheelTurn(WHEEL_AT_REST, 100, 0)
    expect(wheelTurn(first.run, 100, 60).turn).toBeNull() // the same spin
    expect(wheelTurn(first.run, 100, 400).turn).toBe(1)
  })

  it('forgets a movement too small to turn the page', () => {
    const nudge = wheelTurn(WHEEL_AT_REST, 20, 0)
    expect(nudge.turn).toBeNull()
    expect(wheelTurn(nudge.run, 20, 1000).turn).toBeNull()
  })

  it('reads lines and pages as pixels', () => {
    expect(wheelPixels(3, 1, 800)).toBe(90)
    expect(wheelPixels(1, 2, 800)).toBe(800)
    expect(wheelPixels(12, 0, 800)).toBe(12)
  })
})
