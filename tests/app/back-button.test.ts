import { describe, expect, it } from 'vitest'
import { backAction } from '@/app/back-button'

describe('backAction', () => {
  it('closes the page panel first, then leaves the reader, then leaves the app', () => {
    expect(backAction('/reader/3', true)).toBe('close-panel')
    expect(backAction('/reader/3', false)).toBe('to-library')
    expect(backAction('/', false)).toBe('exit')
  })

  it('goes back to the library from any other screen', () => {
    expect(backAction('/settings', false)).toBe('to-library')
    expect(backAction('/settings', true)).toBe('to-library') // the panel is the reader's
  })
})
