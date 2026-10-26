import { describe, expect, it } from 'vitest'
import { FONT_CHOICES, fontChoiceOf, fontName } from '@/lib/fonts'
import { useAppStore } from '@/stores/app-store'

describe('fontName', () => {
  it('names a choice by its first family, so the default setting reads as Inter', () => {
    expect(fontName(useAppStore.getState().fontFamily)).toBe('Inter')
    expect(fontChoiceOf(useAppStore.getState().fontFamily)).toBe(FONT_CHOICES[0])
    expect(fontName('Georgia, "Times New Roman", serif')).toBe('Georgia')
  })

  it('calls anything else Custom', () => {
    expect(fontName('Comic Sans MS, cursive')).toBe('Custom')
  })
})
