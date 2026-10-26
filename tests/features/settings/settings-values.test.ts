import { describe, expect, it } from 'vitest'
import { MAX_WPM, MIN_WPM } from '@/core/pacing'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '@/lib/fonts'
import { sizePercent, stepSize, stepWpm } from '@/features/settings/settings-values'

describe('stepSize', () => {
  it('moves by four pixels, within the limits', () => {
    expect(stepSize(56, 1)).toBe(60)
    expect(stepSize(56, -1)).toBe(52)
    expect(stepSize(MAX_FONT_SIZE - 1, 1)).toBe(MAX_FONT_SIZE)
    expect(stepSize(MIN_FONT_SIZE + 1, -1)).toBe(MIN_FONT_SIZE)
  })
})

describe('stepWpm', () => {
  it('moves by 25, within the limits', () => {
    expect(stepWpm(300, 1)).toBe(325)
    expect(stepWpm(MIN_WPM, -1)).toBe(MIN_WPM)
    expect(stepWpm(MAX_WPM, 1)).toBe(MAX_WPM)
  })
})

describe('sizePercent', () => {
  it('runs from 0 at the smallest to 100 at the largest', () => {
    expect(sizePercent(MIN_FONT_SIZE)).toBe(0)
    expect(sizePercent(MAX_FONT_SIZE)).toBe(100)
  })
})
