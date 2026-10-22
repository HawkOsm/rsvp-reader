import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE, PAGE_PRESETS } from '../../src/core/page-spec'
import { PageOverlay } from '../../src/ui/components/PageOverlay'

const box = { top: 8, left: 8, width: 359, height: 220 }

describe('PageOverlay', () => {
  it('floats in the box it is given, over the screen rather than in its layout', () => {
    render(<PageOverlay box={box} page={DEFAULT_PAGE} plain={false}><p>text</p></PageOverlay>)
    const overlay = screen.getByRole('region', { name: 'Page view' })
    expect(overlay).toHaveStyle({ top: '8px', left: '8px', width: '359px', height: '220px' })
    expect(overlay.className).toContain('absolute')
  })

  it('does not catch clicks, so everything under it stays clickable', () => {
    render(<PageOverlay box={box} page={DEFAULT_PAGE} plain><p>x</p></PageOverlay>)
    expect(screen.getByRole('region').className).toContain('pointer-events-none')
  })

  it('draws no container around a page that is already one (a PDF)', () => {
    render(<PageOverlay box={box} page={PAGE_PRESETS.letter} plain><p>pdf page</p></PageOverlay>)
    const holder = screen.getByText('pdf page').parentElement as HTMLElement
    expect(holder.className).not.toMatch(/border|shadow|rounded/)
    expect(holder.style.background).toBe('')
  })

  it('sets anything else on a bone-coloured sheet shaped like the book page', () => {
    render(<PageOverlay box={box} page={PAGE_PRESETS.letter} plain={false}><p>some text</p></PageOverlay>)
    const sheet = screen.getByText('some text').parentElement as HTMLElement
    expect(sheet.style.getPropertyValue('--color-bg')).toBe('#f4efe3')
    expect(sheet.className).toContain('shadow')
    // letter is 612x792, so as tall as the box allows, narrower than it
    expect(parseFloat(sheet.style.height)).toBeCloseTo(220)
    expect(parseFloat(sheet.style.width)).toBeCloseTo(220 * (612 / 792))
  })

  it('does not let the sheet outgrow the box when the box is narrow', () => {
    render(<PageOverlay box={{ ...box, width: 100 }} page={PAGE_PRESETS.letter} plain={false}><p>t</p></PageOverlay>)
    const sheet = screen.getByText('t').parentElement as HTMLElement
    expect(parseFloat(sheet.style.width)).toBeLessThanOrEqual(100)
    expect(parseFloat(sheet.style.height)).toBeCloseTo(100 * (792 / 612))
  })
})
