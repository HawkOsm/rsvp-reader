import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageOverlay } from '../../src/ui/components/PageOverlay'

describe('PageOverlay', () => {
  it('floats its content exactly inside the box it is given', () => {
    render(
      <PageOverlay box={{ top: 300, left: 8, width: 359, height: 220 }}>
        <p>the page</p>
      </PageOverlay>,
    )
    const overlay = screen.getByRole('region', { name: 'Page view' })
    expect(overlay).toHaveStyle({ top: '300px', left: '8px', width: '359px', height: '220px' })
    expect(overlay).toContainElement(screen.getByText('the page'))
    expect(overlay.className).toContain('absolute') // over the reading area, not part of its layout
  })
})
