import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PagePanel } from '@/features/reader/components/PagePanel'

// Which kind of box a book has decides how its highlight is placed, so the
// choice made here matters: the panel itself is replaced by a recorder.
const received: Record<string, unknown>[] = []
vi.mock('@/features/reader/components/PdfPagePanel', () => ({
  PdfPagePanel: (props: Record<string, unknown>) => {
    received.push(props)
    return null
  },
}))
vi.mock('@/features/reader/components/TextReflowPanel', () => ({
  TextReflowPanel: () => <div data-testid="reflow" />,
}))

const last = () => received.at(-1)

describe('PagePanel', () => {
  it('treats a book without the displayed-boxes marker as legacy', () => {
    render(<PagePanel bookId={1} layout={{ kind: 'paged', pages: 5 }} />)
    expect(last()?.legacyBoxes).toBe(true)
  })

  it('does not for a book imported with displayed-page boxes', () => {
    render(<PagePanel bookId={1} layout={{ kind: 'paged', pages: 5, boxSpace: 'displayed' }} />)
    expect(last()?.legacyBoxes).toBe(false)
  })

  it('says so in the full-width book view too', () => {
    render(<PagePanel bookId={1} layout={{ kind: 'paged', pages: 5 }} variant="book" />)
    expect(last()?.legacyBoxes).toBe(true)
    render(
      <PagePanel
        bookId={1}
        layout={{ kind: 'paged', pages: 5, boxSpace: 'displayed' }}
        variant="book"
      />,
    )
    expect(last()?.legacyBoxes).toBe(false)
  })

  it('shows reflowed text instead of pages for a book without any', () => {
    const { getByTestId } = render(<PagePanel bookId={1} layout={{ kind: 'reflow' }} />)
    expect(getByTestId('reflow')).toBeInTheDocument()
  })
})
