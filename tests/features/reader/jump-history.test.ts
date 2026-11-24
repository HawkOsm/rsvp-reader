import { describe, expect, it } from 'vitest'
import { NO_JUMPS, recordJump, stepBack, stepForward } from '@/features/reader/jump-history'

describe('jump history', () => {
  it('goes back to where the reader was before a jump, and forward again', () => {
    let h = recordJump(NO_JUMPS, 10) // jumped from 10 to 500
    h = recordJump(h, 500) // and from 500 to 900
    const first = stepBack(h, 900)!
    expect(first.to).toBe(500)
    const second = stepBack(first.history, 500)!
    expect(second.to).toBe(10)
    expect(stepBack(second.history, 10)).toBeNull()

    const again = stepForward(second.history, 10)!
    expect(again.to).toBe(500)
    expect(stepForward(again.history, 500)!.to).toBe(900)
  })

  it('forgets the way forward once the reader jumps somewhere new', () => {
    const back = stepBack(recordJump(NO_JUMPS, 10), 500)!
    const h = recordJump(back.history, 10)
    expect(stepForward(h, 300)).toBeNull()
    expect(stepBack(h, 300)!.to).toBe(10)
  })

  it('remembers a place once, however often it is left, and no more than fifty places', () => {
    const once = recordJump(recordJump(NO_JUMPS, 10), 10)
    expect(once.back).toEqual([10])
    let h = NO_JUMPS
    for (let i = 0; i < 80; i++) h = recordJump(h, i)
    expect(h.back).toHaveLength(50)
    expect(h.back[0]).toBe(30)
  })
})
