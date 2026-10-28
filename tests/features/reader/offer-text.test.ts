import { describe, expect, it } from 'vitest'
import { makeToken } from '@/core/types'
import { offerMessage } from '@/features/reader/offer-text'

const pdf = Array.from({ length: 40 }, (_, i) => makeToken(`w${i}`, { page: Math.floor(i / 10) }))
const text = Array.from({ length: 3000 }, (_, i) => makeToken(`w${i}`))

describe('the position offer', () => {
  it('counts pages in a paged book', () => {
    const paged = { kind: 'paged', pages: 4 } as const
    expect(offerMessage('Chrome on Android', 2, 35, paged, pdf)).toBe(
      'Chrome on Android is 3 pages further on.',
    )
    expect(offerMessage('Phone', 25, 12, paged, pdf)).toBe('Phone is 1 page back.')
    expect(offerMessage('Phone', 2, 5, paged, pdf)).toBe('Phone is further down this page.')
  })

  it('counts words in a reflowed book', () => {
    expect(offerMessage('Phone', 10, 1250, { kind: 'reflow' }, text)).toBe(
      'Phone is 1,240 words further on.',
    )
    expect(offerMessage('Phone', 1, 0, { kind: 'reflow' }, text)).toBe('Phone is 1 word back.')
  })
})
