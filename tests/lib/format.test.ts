import { describe, expect, it } from 'vitest'
import { formatBytes } from '@/lib/format'

describe('formatBytes', () => {
  it('rounds to KB below a megabyte, never to nothing', () => {
    expect(formatBytes(10)).toBe('1 KB')
    expect(formatBytes(12 * 1024)).toBe('12 KB')
  })

  it('rounds to MB above', () => {
    expect(formatBytes(182.4 * 1024 * 1024)).toBe('182 MB')
  })
})
