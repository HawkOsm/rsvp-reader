import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBookGestures, type BookGestures } from '@/features/reader/hooks/useBookGestures'

const handlers = { onTurn: vi.fn(), onZoom: vi.fn(), onDoubleTap: vi.fn() }
const onWord = vi.fn()
const base: BookGestures = { canSwipe: true, scale: 1, minScale: 0.5, maxScale: 5, ...handlers }

function Page({ gestures }: { gestures: BookGestures | null }) {
  const area = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useBookGestures(area, content, gestures)
  return (
    <div ref={area} data-testid="area">
      <div ref={content} data-testid="content">
        <button onClick={onWord}>word</button>
      </div>
    </div>
  )
}

/** A pointer event as a finger (or a mouse) makes it. jsdom's own
 * PointerEvent doesn't take every field, so it is built by hand. */
function touch(
  el: Element,
  type: string,
  id: number,
  x: number,
  y: number,
  at: number,
  pointerType = 'touch',
) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerId: id, pointerType, clientX: x, clientY: y })
  Object.defineProperty(event, 'timeStamp', { value: at })
  el.dispatchEvent(event)
}

function setup(gestures: BookGestures | null = base) {
  const { getByTestId } = render(<Page gestures={gestures} />)
  return { area: getByTestId('area'), content: getByTestId('content') }
}

beforeEach(() => vi.clearAllMocks())

describe('useBookGestures', () => {
  it('turns the page on a sideways swipe', () => {
    const { area } = setup()
    touch(area, 'pointerdown', 1, 300, 400, 0)
    touch(area, 'pointermove', 1, 200, 405, 80)
    touch(area, 'pointerup', 1, 150, 410, 150)
    expect(handlers.onTurn).toHaveBeenCalledWith(1)

    touch(area, 'pointerdown', 1, 100, 400, 1000)
    touch(area, 'pointerup', 1, 260, 400, 1150)
    expect(handlers.onTurn).toHaveBeenLastCalledWith(-1)
  })

  it('leaves a sideways swipe alone while the page is wide enough to scroll sideways', () => {
    const { area } = setup({ ...base, canSwipe: false })
    touch(area, 'pointerdown', 1, 300, 400, 0)
    touch(area, 'pointerup', 1, 150, 400, 150)
    expect(handlers.onTurn).not.toHaveBeenCalled()
  })

  it('ignores a mouse: dragging selects text, as before', () => {
    const { area } = setup()
    touch(area, 'pointerdown', 1, 300, 400, 0, 'mouse')
    touch(area, 'pointerup', 1, 150, 400, 150, 'mouse')
    expect(handlers.onTurn).not.toHaveBeenCalled()
  })

  it('stretches the page while two fingers pinch, and zooms when they lift', () => {
    const { area, content } = setup()
    touch(area, 'pointerdown', 1, 100, 300, 0)
    touch(area, 'pointerdown', 2, 200, 300, 10)
    touch(area, 'pointermove', 2, 300, 300, 50) // twice as far apart
    expect(content.style.transform).toBe('scale(2)')
    touch(area, 'pointerup', 2, 300, 300, 100)
    expect(handlers.onZoom).toHaveBeenCalledWith(2)
    expect(content.style.transform).toBe('')
    // Lifting the other finger is not a tap, a swipe or a page turn.
    touch(area, 'pointerup', 1, 100, 300, 120)
    expect(handlers.onTurn).not.toHaveBeenCalled()
    expect(handlers.onDoubleTap).not.toHaveBeenCalled()
  })

  it('switches the fit on a double tap, without also clicking the word under it', () => {
    const { area } = setup()
    const word = area.querySelector('button')!
    touch(word, 'pointerdown', 1, 100, 300, 0)
    touch(word, 'pointerup', 1, 100, 300, 60)
    word.click() // the first tap is an ordinary tap on a word
    expect(onWord).toHaveBeenCalledTimes(1)
    touch(word, 'pointerdown', 1, 104, 302, 200)
    touch(word, 'pointerup', 1, 104, 302, 250)
    word.click()
    expect(handlers.onDoubleTap).toHaveBeenCalledOnce()
    expect(onWord).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the gestures are off, or the touch is cancelled', () => {
    const off = setup(null)
    touch(off.area, 'pointerdown', 1, 300, 400, 0)
    touch(off.area, 'pointerup', 1, 150, 400, 150)
    expect(handlers.onTurn).not.toHaveBeenCalled()
    cleanup()

    const { area } = setup()
    touch(area, 'pointerdown', 1, 300, 400, 0)
    touch(area, 'pointercancel', 1, 150, 400, 150) // the browser took over, to scroll
    expect(handlers.onTurn).not.toHaveBeenCalled()
  })
})
