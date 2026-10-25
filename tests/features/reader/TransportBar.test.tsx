import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { TransportBar } from '@/features/reader/components/TransportBar'
import { EngineProvider } from '@/features/reader/engine-context'

function renderWithEngine(words: string[], wpm = 300) {
  const tokens = words.map((w) => makeToken(w))
  const engine = createEngine(tokens, { wpm })
  render(
    <EngineProvider value={engine}>
      <TransportBar layout={{ kind: 'reflow' }} />
    </EngineProvider>,
  )
  return engine
}

describe('TransportBar, for a book with chapters', () => {
  function renderChapters(chapters: { title: string; startTokenIndex: number }[]) {
    const engine = createEngine(
      Array.from({ length: 1001 }, (_, i) => makeToken(`w${i}`)),
      { wpm: 100 },
    )
    render(
      <EngineProvider value={engine}>
        <TransportBar layout={{ kind: 'reflow' }} chapters={chapters} />
      </EngineProvider>,
    )
    return engine
  }

  it('ticks each chapter start and says the time left in this chapter', () => {
    const engine = renderChapters([
      { title: 'One', startTokenIndex: 0 },
      { title: 'Two', startTokenIndex: 500 },
    ])
    expect(screen.getAllByTestId('chapter-tick')).toHaveLength(1)
    // 499 words at 100 wpm, then the whole book's 1,000.
    expect(screen.getByTestId('time-left')).toHaveTextContent('5 min left in chapter · 10 min left')
    act(() => engine.seek(500))
    expect(screen.getByTestId('time-left')).toHaveTextContent('5 min left in chapter · 5 min left')
  })

  it('shows neither for a book without chapters', () => {
    renderChapters([])
    expect(screen.queryAllByTestId('chapter-tick')).toHaveLength(0)
    expect(screen.getByTestId('time-left')).toHaveTextContent(/^10 min left$/)
  })
})

describe('TransportBar', () => {
  it('shows the word counter in "word N / total · P%" form', () => {
    renderWithEngine(['one', 'two', 'three', 'four'])
    expect(screen.getByTestId('word-counter')).toHaveTextContent('word 1 / 4 · 0.0%')
  })

  it('updates the counter when the engine advances', () => {
    const engine = renderWithEngine(['one', 'two', 'three', 'four'])
    act(() => engine.seek(2))
    expect(screen.getByTestId('word-counter')).toHaveTextContent('word 3 / 4 · 50.0%')
  })

  it('shows the page segment for a paged book', () => {
    const tokens = [makeToken('a', { page: 0 }), makeToken('b', { page: 1 })]
    const engine = createEngine(tokens)
    render(
      <EngineProvider value={engine}>
        <TransportBar layout={{ kind: 'paged', pages: 5 }} />
      </EngineProvider>,
    )
    expect(screen.getByTestId('word-counter')).toHaveTextContent('page 1 / 5')
  })

  it('leaves the page segment out when the current word has no page', () => {
    const engine = createEngine([makeToken('a')]) // page -1
    render(
      <EngineProvider value={engine}>
        <TransportBar layout={{ kind: 'paged', pages: 5 }} />
      </EngineProvider>,
    )
    expect(screen.getByTestId('word-counter')).not.toHaveTextContent('page')
  })

  it('leaves the page segment out for a reflow book, even if its tokens have pages', () => {
    const engine = createEngine([makeToken('a', { page: 0 })])
    render(
      <EngineProvider value={engine}>
        <TransportBar layout={{ kind: 'reflow' }} />
      </EngineProvider>,
    )
    expect(screen.getByTestId('word-counter')).not.toHaveTextContent('page')
  })

  it('toggles the Play/Pause label and calls engine.toggle()', async () => {
    const user = userEvent.setup()
    const engine = renderWithEngine(['one', 'two', 'three'])
    const button = screen.getByRole('button', { name: 'Play' })

    await user.click(button)
    expect(engine.isPlaying).toBe(true)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(engine.isPlaying).toBe(false)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('the scrub bar seeks the engine', () => {
    renderWithEngine(['a', 'b', 'c', 'd', 'e'])
    const scrub = screen.getByRole('slider', { name: 'Scrub' })

    fireEvent.change(scrub, { target: { value: '3' } })

    expect(screen.getByTestId('word-counter')).toHaveTextContent('word 4 / 5')
  })

  it('changing the WPM input calls engine.setWpm and clamps to the valid range', async () => {
    const user = userEvent.setup()
    const engine = renderWithEngine(['one', 'two'], 300)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '9999')
    await user.tab()

    expect(engine.wpm).toBe(1500) // MAX_WPM
  })

  it('reflects a WPM change made elsewhere (e.g. a keyboard shortcut)', () => {
    const engine = renderWithEngine(['one', 'two'], 300)
    act(() => engine.setWpm(450))
    expect(screen.getByRole('spinbutton')).toHaveValue(450)
  })

  it('the ten-word buttons skip back and forward', async () => {
    const user = userEvent.setup()
    const engine = renderWithEngine(Array.from({ length: 30 }, (_, i) => `w${i}`))
    await user.click(screen.getByRole('button', { name: 'Forward ten words' }))
    expect(engine.index).toBe(10)
    await user.click(screen.getByRole('button', { name: 'Back ten words' }))
    expect(engine.index).toBe(0)
  })

  it('the speed buttons step the WPM by 25', async () => {
    const user = userEvent.setup()
    const engine = renderWithEngine(['one', 'two'], 300)
    await user.click(screen.getByRole('button', { name: 'Faster' }))
    expect(engine.wpm).toBe(325)
    await user.click(screen.getByRole('button', { name: 'Slower' }))
    await user.click(screen.getByRole('button', { name: 'Slower' }))
    expect(engine.wpm).toBe(275)
  })
})
