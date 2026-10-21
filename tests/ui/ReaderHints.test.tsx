import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReaderHints } from '../../src/ui/components/ReaderHints'

describe('ReaderHints', () => {
  it('offers the RSVP keys in RSVP mode, whatever the layout', () => {
    render(<ReaderHints mode="rsvp" layout={{ kind: 'reflow' }} />)
    expect(screen.getByText('play / pause')).toBeInTheDocument()
  })

  it('offers page keys in book mode over a paged book', () => {
    render(<ReaderHints mode="book" layout={{ kind: 'paged', pages: 10 }} />)
    expect(screen.getByText('turn the page')).toBeInTheDocument()
    expect(screen.getByText('fit page / width')).toBeInTheDocument()
  })

  it('offers word-stepping keys in book mode over reflowed text', () => {
    render(<ReaderHints mode="book" layout={{ kind: 'reflow' }} />)
    expect(screen.getByText('next word')).toBeInTheDocument()
    expect(screen.queryByText('turn the page')).not.toBeInTheDocument()
  })
})
