import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken, type Token } from '@/core/types'
import type { PdfHandle } from '@/pdf/client'
import type { Matrix, PageLine } from '@/pdf/document'
import { EngineProvider } from '@/features/reader/engine-context'
import { PdfPageView } from '@/features/reader/components/PdfPageView'

// jsdom has no canvas: give it just enough to be drawn on.
const putImageData = vi.fn()
beforeEach(() => {
  putImageData.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData } as never)
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data
        this.width = width
        this.height = height
      }
    },
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const FLIP: Matrix = [1, 0, 0, -1, 0, 792]
const ROTATED: Matrix = [0, 1, 1, 0, 0, 0] // /Rotate 90: user (x, y) is shown at (y, x)

function fakeDoc(userToPage: Matrix = FLIP) {
  const render = vi.fn(async (_page: number, scale: number) => ({
    width: Math.round(612 * scale),
    height: Math.round(792 * scale),
    scale,
    rgba: new Uint8ClampedArray(4),
  }))
  const doc = {
    pageCount: 1,
    pageSize: vi.fn(async () => ({ width: 612, height: 792, userToPage })),
    render,
    lines: vi.fn(async (): Promise<PageLine[]> => []),
    onLost: () => () => {},
    close: vi.fn(),
  } as unknown as PdfHandle
  return { doc, render }
}

const tokens: Token[] = [
  makeToken('first', { page: 0, bbox: [72, 700, 120, 712] }),
  makeToken('second', { page: 0, bbox: [200, 600, 250, 612] }),
]

function view(
  props: Partial<React.ComponentProps<typeof PdfPageView>> & { doc: PdfHandle },
  index = 0,
) {
  const engine = createEngine(tokens, { index })
  const onReady = vi.fn()
  const result = render(
    <EngineProvider value={engine}>
      <PdfPageView
        pageIndex={0}
        boxWidth={306}
        scale={undefined}
        highlight={null}
        peek={false}
        legacyBoxes={false}
        onReady={onReady}
        {...props}
      />
    </EngineProvider>,
  )
  return { ...result, engine, onReady }
}

const mark = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('div.pointer-events-none')

describe('PdfPageView drawing', () => {
  it('draws the page at the width it was given, then says it is ready', async () => {
    const { doc, render: draw } = fakeDoc()
    const { onReady, container } = view({ doc }) // 306 wide for a 612pt page: scale 0.5
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(draw.mock.calls[0]?.[1]).toBeCloseTo(0.5 * Math.min(window.devicePixelRatio || 1, 3))
    expect(putImageData).toHaveBeenCalledTimes(1)
    expect(container.querySelector('canvas')?.style.width).toBe('306px')
  })

  it('shrinks the whole page to fit a short space, not just its width', async () => {
    const { doc } = fakeDoc()
    // 306 wide would allow scale 0.5 (396 tall), but only 198 tall is available: scale 0.25
    const { onReady, container } = view({ doc, boxWidth: 306, boxHeight: 198 })
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(container.querySelector('canvas')?.style.height).toBe('198px')
    expect(container.querySelector('canvas')?.style.width).toBe('153px')
  })

  it('uses a fixed scale when it is given one, whatever the width', async () => {
    const { doc } = fakeDoc()
    const { onReady, container } = view({ doc, scale: 1, boxWidth: 100 })
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(container.querySelector('canvas')?.style.width).toBe('612px')
  })

  it('does not draw again when only the width changes but the scale is fixed', async () => {
    const { doc, render: draw } = fakeDoc()
    const { onReady, rerender, engine } = view({ doc, scale: 1, boxWidth: 300 })
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    rerender(
      <EngineProvider value={engine}>
        <PdfPageView
          doc={doc}
          pageIndex={0}
          boxWidth={310}
          scale={1}
          highlight={null}
          peek={false}
          legacyBoxes={false}
          onReady={onReady}
        />
      </EngineProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('cancels a draw still in flight when the page is left', async () => {
    const { doc, render: draw } = fakeDoc()
    let signal: AbortSignal | undefined
    draw.mockImplementation((_p: number, _s: number, options?: { signal?: AbortSignal }) => {
      signal = options?.signal
      return new Promise(() => {}) // never finishes
    })
    const { unmount } = view({ doc })
    await waitFor(() => expect(signal).toBeDefined())
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('asks again, cancelling the old draw, when the scale changes', async () => {
    const { doc, render: draw } = fakeDoc()
    const signals: AbortSignal[] = []
    draw.mockImplementation((_p, scale, options?: { signal?: AbortSignal }) => {
      if (options?.signal) signals.push(options.signal)
      return new Promise(() => void scale)
    })
    const { rerender, engine } = view({ doc, scale: 1 })
    await waitFor(() => expect(signals).toHaveLength(1))
    rerender(
      <EngineProvider value={engine}>
        <PdfPageView
          doc={doc}
          pageIndex={0}
          boxWidth={306}
          scale={2}
          highlight={null}
          peek={false}
          legacyBoxes={false}
          onReady={() => {}}
        />
      </EngineProvider>,
    )
    await waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
  })

  it('stays quiet if the draw is cancelled', async () => {
    const { doc, render: draw } = fakeDoc()
    draw.mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    const { onReady } = view({ doc })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onReady).not.toHaveBeenCalled() // and nothing was thrown
  })
})

describe('PdfPageView highlight', () => {
  it('puts the highlight on the word, from a displayed-page box', async () => {
    const { doc } = fakeDoc()
    const { container, onReady } = view({ doc, scale: 1, highlight: tokens[0]?.bbox as never })
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    // y up from the bottom: 792 - 712 = 80 from the top
    expect(mark(container)).toHaveStyle({
      left: '72px',
      top: '80px',
      width: '48px',
      height: '12px',
    })
  })

  it('scales the highlight with the page', async () => {
    const { doc } = fakeDoc()
    const { container, onReady } = view({ doc, scale: 2, highlight: tokens[0]?.bbox as never })
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(mark(container)).toHaveStyle({
      left: '144px',
      top: '160px',
      width: '96px',
      height: '24px',
    })
  })

  it('puts a legacy (user-space) box through the page transform instead', async () => {
    const { doc } = fakeDoc(ROTATED)
    const { container, onReady } = view({
      doc,
      scale: 1,
      legacyBoxes: true,
      highlight: tokens[0]?.bbox as never,
    })
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    // user box x 72..120, y 700..712 on a page turned on its side: x 700..712, y 72..120
    expect(mark(container)).toHaveStyle({
      left: '700px',
      top: '72px',
      width: '12px',
      height: '48px',
    })
  })

  it('does not treat a legacy box as displayed-space, nor the reverse', async () => {
    const { doc } = fakeDoc(ROTATED)
    const displayed = view({
      doc,
      scale: 1,
      legacyBoxes: false,
      highlight: tokens[0]?.bbox as never,
    })
    await waitFor(() => expect(displayed.onReady).toHaveBeenCalled())
    expect(mark(displayed.container)).toHaveStyle({ left: '72px', top: '80px' })
  })

  it('shows no highlight when there is none', async () => {
    const { doc } = fakeDoc()
    const { container, onReady } = view({ doc, scale: 1 })
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(mark(container)).toBeNull()
  })
})

describe('PdfPageView click to jump', () => {
  async function ready(
    props: Partial<React.ComponentProps<typeof PdfPageView>> & { doc: PdfHandle },
  ) {
    const result = view({ peek: true, scale: 1, ...props }, 1)
    await waitFor(() => expect(result.onReady).toHaveBeenCalled())
    return result
  }

  it('moves the reader to the word that was clicked', async () => {
    const { doc } = fakeDoc()
    const { container, engine } = await ready({ doc })
    // "first" sits at x 72..120, 80..92 from the top
    fireEvent.click(container.querySelector('.shadow-lg') as HTMLElement, {
      clientX: 90,
      clientY: 85,
    })
    expect(engine.index).toBe(0)
  })

  it('finds the word on a rotated page from a legacy box', async () => {
    const { doc } = fakeDoc(ROTATED)
    const { container, engine } = await ready({ doc, legacyBoxes: true })
    // legacy "first" is drawn at x 700..712, y 72..120
    fireEvent.click(container.querySelector('.shadow-lg') as HTMLElement, {
      clientX: 705,
      clientY: 100,
    })
    expect(engine.index).toBe(0)
  })

  it('ignores a click that is not near a word', async () => {
    const { doc } = fakeDoc()
    const { container, engine } = await ready({ doc })
    fireEvent.click(container.querySelector('.shadow-lg') as HTMLElement, {
      clientX: 400,
      clientY: 400,
    })
    expect(engine.index).toBe(1)
  })

  it('does nothing outside the follow-along panel', async () => {
    const { doc } = fakeDoc()
    const { container, engine } = await ready({ doc, peek: false })
    fireEvent.click(container.querySelector('.shadow-lg') as HTMLElement, {
      clientX: 90,
      clientY: 85,
    })
    expect(engine.index).toBe(1)
  })
})
