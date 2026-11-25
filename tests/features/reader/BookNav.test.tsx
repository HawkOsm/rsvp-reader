import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine, type Engine } from '@/core/engine'
import { makeToken, type ContentLayout } from '@/core/types'
import { BookNav } from '@/features/reader/components/BookNav'
import { EngineProvider } from '@/features/reader/engine-context'
import { useJumps } from '@/features/reader/hooks/useJumps'
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

/** Forty words, ten to a page: four pages. */
const tokens = () =>
  Array.from({ length: 40 }, (_, i) => makeToken(`w${i}`, { page: Math.floor(i / 10) }))
const CHAPTERS = [
  { title: 'One', startTokenIndex: 0 },
  { title: 'Two', startTokenIndex: 20 },
]
const PAGED: ContentLayout = { kind: 'paged', pages: 4, boxSpace: 'displayed' }

function Nav({ layout, startOpen }: { layout: ContentLayout; startOpen: boolean }) {
  const jumps = useJumps()
  const [open, setOpen] = useState(startOpen)
  return <BookNav layout={layout} chapters={CHAPTERS} jumps={jumps} open={open} onOpen={setOpen} />
}

function renderNav(layout: ContentLayout = PAGED, startOpen = true): Engine {
  const engine = createEngine(tokens())
  render(
    <EngineProvider value={engine}>
      <Nav layout={layout} startOpen={startOpen} />
    </EngineProvider>,
  )
  return engine
}

beforeEach(() => {
  screenWithRoom(true)
  useAppStore.setState({
    bookLayout: 'single',
    bookScale: 0.5,
    bookFits: { page: 0.4, width: 0.6 },
    bookFit: null,
    blankPage: null,
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('BookNav', () => {
  it('shows only where the reader is, with an arrow each side to turn the page', async () => {
    const engine = renderNav(PAGED, false)
    expect(screen.getByTestId('book-status')).toHaveTextContent('page 1 / 4 · 0%')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(engine.index).toBe(10)
    expect(screen.getByTestId('book-status')).toHaveTextContent('page 2 / 4 · 26%')
  })

  it('opens the jump panel, goes to a typed page, and comes back from it', async () => {
    const user = userEvent.setup()
    const engine = renderNav(PAGED, false)
    await user.click(screen.getByTestId('book-status'))
    await user.type(screen.getByRole('textbox', { name: 'Page number' }), '3{Enter}')
    expect(engine.index).toBe(20)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // going closes it

    await user.click(screen.getByTestId('book-status'))
    await user.click(screen.getByRole('button', { name: /Back to page 1/ }))
    expect(engine.index).toBe(0)
    await user.click(screen.getByRole('button', { name: /Forward/ }))
    expect(engine.index).toBe(20)
  })

  it('keeps a typed page inside the book', async () => {
    const user = userEvent.setup()
    const engine = renderNav()
    await user.type(screen.getByRole('textbox', { name: 'Page number' }), '99{Enter}')
    expect(engine.index).toBe(30) // the last page
  })

  it('shows a page with no words when asked for it, and leaves the place where it was', async () => {
    const user = userEvent.setup()
    // A fifth page, with nothing on it to read.
    const engine = renderNav({ ...PAGED, pages: 5 }, false)
    act(() => engine.seek(12))
    await user.click(screen.getByTestId('book-status'))
    await user.type(screen.getByRole('textbox', { name: 'Page number' }), '5{Enter}')
    expect(screen.getByTestId('book-page-label')).toHaveTextContent('page 5 / 5')
    expect(engine.index).toBe(12)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByTestId('book-page-label')).toHaveTextContent('page 4 / 5')
    expect(engine.index).toBe(30)
    expect(useAppStore.getState().blankPage).toBeNull()
  })

  it('steps by chapter: first back to the start of this one', async () => {
    const user = userEvent.setup()
    const engine = renderNav()
    act(() => engine.seek(25))
    await user.click(screen.getByRole('button', { name: '‹ Chapter' }))
    expect(engine.index).toBe(20)
    await user.click(screen.getByRole('button', { name: '‹ Chapter' }))
    expect(engine.index).toBe(0)
    expect(screen.getByRole('button', { name: '‹ Chapter' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Chapter ›' }))
    expect(engine.index).toBe(20)
    expect(screen.getByRole('button', { name: 'Chapter ›' })).toBeDisabled()
  })

  it('lays the pages out: one or two, the fit, and the size', async () => {
    const user = userEvent.setup()
    renderNav()
    await user.click(screen.getByRole('button', { name: 'Two pages' }))
    expect(useAppStore.getState().bookLayout).toBe('spread')
    await user.click(screen.getByRole('button', { name: 'Fit page' }))
    expect(useAppStore.getState().bookScale).toBe(0.4)
    await user.click(screen.getByRole('button', { name: 'Fit width' }))
    expect(useAppStore.getState().bookScale).toBe(0.6)
    await user.click(screen.getByRole('button', { name: 'Bigger' }))
    expect(useAppStore.getState().bookScale).toBeGreaterThan(0.6)
  })

  it('offers one page only on a small screen, and the fit only when there is something to fit', () => {
    screenWithRoom(false)
    useAppStore.setState({ bookScale: 0.58, bookFits: { page: 0.58, width: 0.58 } })
    renderNav()
    expect(screen.queryByRole('button', { name: /Single page|Two pages/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Fit/ })).not.toBeInTheDocument()
    cleanup()

    // Pinched in: the control that puts it back.
    useAppStore.setState({ bookScale: 1.5 })
    renderNav()
    expect(screen.getByRole('button', { name: 'Fit page' })).toBeInTheDocument()
  })

  it('in a book without pages, shows how far through and the chapter, and goes to a percent', async () => {
    const user = userEvent.setup()
    const engine = renderNav({ kind: 'reflow' })
    act(() => engine.seek(30))
    expect(screen.getByTestId('book-status')).toHaveTextContent('77% · Two')
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Fit/ })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Percent through the book' }), '50{Enter}')
    expect(engine.index).toBe(20)
  })

  it('closes on Escape, and on a press anywhere else', async () => {
    const user = userEvent.setup()
    renderNav()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('book-status'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.pointer({ keys: '[MouseLeft]', target: document.body })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('useJumps', () => {
  it('remembers where a jump was made from', () => {
    const engine = createEngine(tokens())
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EngineProvider value={engine}>{children}</EngineProvider>
    )
    const { result } = renderHook(() => useJumps(), { wrapper })
    act(() => result.current.to(30))
    expect(engine.index).toBe(30)
    expect(result.current.backTo).toBe(0)
    act(() => result.current.back())
    expect(engine.index).toBe(0)
    expect(result.current.forwardTo).toBe(30)
  })
})
