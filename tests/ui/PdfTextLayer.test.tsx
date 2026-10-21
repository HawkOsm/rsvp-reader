import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PageLine } from '../../src/pdf/document'
import { PdfTextLayer } from '../../src/ui/components/PdfTextLayer'

// jsdom has no canvas; the layer then skips stretching lines to measured widths.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

const word = (text: string, x0: number, y0: number, x1: number, y1: number) => ({ text, x0, y0, x1, y1 })
const line = (...words: ReturnType<typeof word>[]): PageLine => ({ block: 0, baseline: 0, words })

const horizontal = (y: number, ...texts: string[]): PageLine =>
  line(...texts.map((t, i) => word(t, 72 + i * 60, y, 72 + i * 60 + 50, y + 12)))

describe('PdfTextLayer', () => {
  it('has one span per line, with the words in it', () => {
    const { container } = render(
      <PdfTextLayer lines={[horizontal(100, 'The', 'first'), horizontal(114, 'second')]} scale={1} />,
    )
    const spans = [...container.querySelectorAll('span')]
    expect(spans.map((s) => s.textContent)).toEqual(['The first', 'second'])
  })

  it('puts a line break between lines, so copied text keeps them apart', () => {
    const { container } = render(
      <PdfTextLayer
        lines={[horizontal(100, 'one'), horizontal(114, 'two'), horizontal(128, 'three')]}
        scale={1}
      />,
    )
    expect(container.querySelectorAll('br')).toHaveLength(2) // between, not after the last
    // Reading the layer's text the way a copy does gives each line on its own.
    const parts = [...container.querySelector('.pdfTextLayer')!.childNodes].map((n) =>
      n.nodeName === 'BR' ? '\n' : n.textContent,
    )
    expect(parts.join('')).toBe('one\ntwo\nthree')
  })

  it('puts each line where it is on the page, at the page scale', () => {
    const { container } = render(<PdfTextLayer lines={[horizontal(100, 'word')]} scale={2} />)
    const span = container.querySelector('span') as HTMLElement
    expect(span.style.left).toBe('144px') // 72pt at 2x
    expect(span.style.top).toBe('200px')
    expect(span.style.fontSize).toBe('24px') // as tall as the line
  })

  it('uses the left-most and right-most word, whatever order the line comes in', () => {
    const rtl = line(word('second', 300, 100, 350, 112), word('first', 72, 100, 122, 112))
    const { container } = render(<PdfTextLayer lines={[rtl]} scale={1} />)
    expect((container.querySelector('span') as HTMLElement).style.left).toBe('72px')
  })

  it('leaves out a line that runs down the page rather than draw it as a mess', () => {
    // a /Rotate 90 page: each "line" is 17 wide and 200 tall
    const sideways = line(word('turned', 700, 72, 717, 150), word('text', 700, 160, 717, 272))
    const { container } = render(
      <PdfTextLayer lines={[sideways, horizontal(100, 'upright')]} scale={1} />,
    )
    expect([...container.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['upright'])
    expect(container.querySelectorAll('br')).toHaveLength(0)
  })

  it('keeps a short horizontal line, such as a lone "I"', () => {
    const { container } = render(<PdfTextLayer lines={[line(word('I', 72, 100, 76, 112))]} scale={1} />)
    expect(container.querySelector('span')?.textContent).toBe('I')
  })

  it('keeps a short line of narrow letters, which is narrower than it is tall', () => {
    const { container } = render(<PdfTextLayer lines={[line(word('ill', 72, 100, 82, 112))]} scale={1} />)
    expect(container.querySelector('span')?.textContent).toBe('ill')
  })

  it('ignores a line with no words', () => {
    const { container } = render(<PdfTextLayer lines={[line(), horizontal(100, 'x')]} scale={1} />)
    expect(container.querySelectorAll('span')).toHaveLength(1)
  })
})
