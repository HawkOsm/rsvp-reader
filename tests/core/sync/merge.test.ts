import { describe, expect, it } from 'vitest'
import { compareHlc } from '@/core/sync/hlc'
import { keyOf, newerRegisters, type Register, type SyncOp } from '@/core/sync/merge'

const progress = (wordIndex: number) => ({ wordIndex, wpm: 300, mode: 'rsvp' as const })

function op(device: string, seq: number, wall: number, wordIndex: number, book = 'x'): SyncOp {
  // `seq` doubles as the count: a device's clock never stamps two ops alike.
  return {
    device,
    seq,
    hlc: { wall, count: seq, device },
    change: { kind: 'progress', book, value: progress(wordIndex) },
  }
}

const apply = (state: Map<string, Register>, ops: SyncOp[]) => {
  for (const r of newerRegisters(state, ops)) state.set(r.key, r)
  return state
}

describe('newerRegisters', () => {
  it('keeps the newest op per key', () => {
    const winners = newerRegisters(new Map(), [op('a', 1, 10, 100), op('b', 1, 20, 200)])
    expect(winners).toHaveLength(1)
    expect(winners[0]!.change).toMatchObject({ value: { wordIndex: 200 } })
  })

  it('ignores ops older than what is held', () => {
    const state = apply(new Map(), [op('a', 1, 50, 100)])
    expect(newerRegisters(state, [op('b', 1, 20, 200)])).toEqual([])
  })

  it('changes nothing when an op is applied twice', () => {
    const state = apply(new Map(), [op('a', 1, 50, 100)])
    expect(newerRegisters(state, [op('a', 1, 50, 100)])).toEqual([])
  })

  it('lets a deletion beat an older add, and a newer re-add beat the deletion', () => {
    const book = (wall: number, value: { title: string } | null): SyncOp => ({
      device: 'a',
      seq: wall,
      hlc: { wall, count: 0, device: 'a' },
      change: {
        kind: 'book',
        book: 'x',
        value: value && { ...value, formatId: 'text', totalWords: 1 },
      },
    })
    const removed = apply(new Map(), [book(1, { title: 'T' }), book(2, null)])
    expect(removed.get('book:x')?.change).toMatchObject({ value: null })
    const readded = apply(removed, [book(3, { title: 'T' })])
    expect(readded.get('book:x')?.change).toMatchObject({ value: { title: 'T' } })
  })

  it('ends in the same state whatever order and batches the ops arrive in', () => {
    // A small seeded generator, so a failure can be reproduced.
    let seed = 42
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]!

    const ops: SyncOp[] = []
    for (let i = 0; i < 300; i++) {
      const device = pick(['a', 'b', 'c'])
      ops.push(op(device, i, Math.floor(random() * 50), i, pick(['x', 'y', 'z'])))
    }
    const expected = new Map<string, Register>()
    for (const o of ops) {
      const key = keyOf(o.change)
      const known = expected.get(key)
      if (!known || compareHlc(o.hlc, known.hlc) > 0)
        expected.set(key, { key, hlc: o.hlc, change: o.change })
    }

    for (let run = 0; run < 20; run++) {
      const shuffled = [...ops].sort(() => random() - 0.5)
      const state = new Map<string, Register>()
      while (shuffled.length) apply(state, shuffled.splice(0, 1 + Math.floor(random() * 40)))
      expect(state).toEqual(expected)
    }
  })
})
