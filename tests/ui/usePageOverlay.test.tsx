import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePageOverlay } from '../../src/ui/hooks/usePageOverlay'
import { pageOverlayBox } from '../../src/ui/page-overlay'
import { useAppStore } from '../../src/ui/store'

// jsdom does no layout: give an element a size, and let the test resize it.
let size = { width: 375, height: 640 }
let notify: () => void = () => {}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notify = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.height)
  size = { width: 375, height: 640 }
  useAppStore.setState({ fontSize: 56 })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** One ref for the life of a test, as a component's own ref would be. */
const area = () => ({ current: document.createElement('div') })

describe('usePageOverlay', () => {
  it('gives the box that fits the area it is pointed at', () => {
    const ref = area()
    const { result } = renderHook(() => usePageOverlay(ref))
    expect(result.current).toEqual(pageOverlayBox({ width: 375, height: 640 }, 56))
    expect(result.current).not.toBeNull()
  })

  it('moves the box when the area is resized, as when the phone is turned', () => {
    const ref = area()
    const { result } = renderHook(() => usePageOverlay(ref))
    const upright = result.current
    size = { width: 740, height: 230 }
    act(() => notify())
    expect(result.current).toBeNull() // sideways: no room that keeps off the word
    size = { width: 375, height: 640 }
    act(() => notify())
    expect(result.current).toEqual(upright)
  })

  it('follows the text size setting', () => {
    const ref = area()
    const { result } = renderHook(() => usePageOverlay(ref))
    const small = result.current
    act(() => useAppStore.setState({ fontSize: 96 }))
    expect(result.current).not.toEqual(small)
    expect(result.current).toEqual(pageOverlayBox({ width: 375, height: 640 }, 96))
  })

  it('is null until the area has a ref to measure', () => {
    const { result } = renderHook(() => usePageOverlay({ current: null }))
    expect(result.current).toBeNull()
  })
})
