import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { BookControls } from '@/features/reader/components/BookControls'
import { EngineProvider } from '@/features/reader/engine-context'
import { useAppStore } from '@/stores/app-store'

/** A screen where `(min-width: 48rem) and (min-height: 30rem)` is or isn't true. */
function screenWithRoom(room: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: room,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function renderControls() {
  const tokens = Array.from({ length: 40 }, (_, i) =>
    makeToken(`w${i}`, { page: Math.floor(i / 10) }),
  )
  render(
    <EngineProvider value={createEngine(tokens)}>
      <BookControls pageCount={4} />
    </EngineProvider>,
  )
}

beforeEach(() => {
  useAppStore.setState({
    bookLayout: 'spread',
    bookScale: 0.5,
    bookFits: { page: 0.4, width: 0.6 },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('BookControls', () => {
  it('offers the spread, the size slider and the fit on a screen with room', () => {
    screenWithRoom(true)
    renderControls()
    expect(screen.getByRole('button', { name: 'Single page' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Page size' })).toBeInTheDocument()
    expect(screen.getByTestId('book-page-label')).toHaveTextContent('pages 1–2 / 4')
  })

  it('shows one page at a time on a small screen, without the spread or the slider', () => {
    screenWithRoom(false)
    renderControls()
    expect(screen.queryByRole('button', { name: /Single page|Two pages/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Page size' })).not.toBeInTheDocument()
    // The chosen layout is still "spread"; the small screen overrides it.
    expect(screen.getByTestId('book-page-label')).toHaveTextContent('page 1 / 4')
    expect(screen.getByRole('button', { name: /Fit/ })).toBeInTheDocument()
    expect(useAppStore.getState().bookLayout).toBe('spread')
  })

  it('drops the fit button when both fits are the same size', () => {
    screenWithRoom(false)
    useAppStore.setState({ bookFits: { page: 0.58, width: 0.58 }, bookScale: 0.58 })
    renderControls()
    expect(screen.queryByRole('button', { name: /Fit/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument()
  })
})
