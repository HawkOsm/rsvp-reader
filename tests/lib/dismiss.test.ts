import { describe, expect, it, vi } from 'vitest'
import { dismissTop, whileOpen } from '@/lib/dismiss'

describe('closing what lies over a screen', () => {
  it('closes the thing opened last, and says when nothing is open', () => {
    expect(dismissTop()).toBe(false)
    const panel = vi.fn()
    const popover = vi.fn()
    const panelClosed = whileOpen(panel)
    const popoverClosed = whileOpen(popover)

    expect(dismissTop()).toBe(true)
    expect(popover).toHaveBeenCalledOnce()
    expect(panel).not.toHaveBeenCalled()
    popoverClosed() // it closed itself, as asked

    expect(dismissTop()).toBe(true)
    expect(panel).toHaveBeenCalledOnce()
    panelClosed()
    expect(dismissTop()).toBe(false)
  })

  it('forgets a thing that closed some other way', () => {
    const panel = vi.fn()
    const closed = whileOpen(panel)
    closed()
    expect(dismissTop()).toBe(false)
    expect(panel).not.toHaveBeenCalled()
  })
})
