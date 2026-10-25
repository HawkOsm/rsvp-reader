import { describe, expect, it } from 'vitest'
import { timeLeftLabel } from '@/features/reader/time-left'

describe('timeLeftLabel', () => {
  it('says "under a minute" near the end', () => {
    expect(timeLeftLabel(100, 300)).toBe('under a minute')
    expect(timeLeftLabel(0, 300)).toBe('under a minute')
  })

  it('counts minutes, then hours and minutes', () => {
    expect(timeLeftLabel(3000, 300)).toBe('10 min')
    expect(timeLeftLabel(19500, 300)).toBe('1 h 5 min')
  })
})
