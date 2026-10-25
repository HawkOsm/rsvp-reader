import { describe, expect, it } from 'vitest'
import { makeToken } from '@/core/types'
import { contextAround } from '@/features/reader/context'

const words = (text: string, paraEndAt: number[] = []) =>
  text.split(' ').map((w, i) => makeToken(w, { paraEnd: paraEndAt.includes(i) }))

describe('contextAround', () => {
  it('takes up to `radius` words either side', () => {
    const tokens = words('a b c d e f g')
    expect(contextAround(tokens, 3, 2)).toEqual({ before: 'b c', current: 'd', after: 'e f' })
  })

  it('stops at paragraph ends', () => {
    // "a b." ends a paragraph; "c d e." is the next one.
    const tokens = words('a b. c d e.', [1, 4])
    expect(contextAround(tokens, 3)).toEqual({ before: 'c', current: 'd', after: 'e.' })
    expect(contextAround(tokens, 1)).toEqual({ before: 'a', current: 'b.', after: '' })
  })

  it('is empty around a missing word', () => {
    expect(contextAround([], 0)).toEqual({ before: '', current: '', after: '' })
  })
})
