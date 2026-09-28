import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createEngine } from '../../src/core/engine'
import { makeToken } from '../../src/core/types'
import { TransportBar } from '../../src/ui/components/TransportBar'
import { EngineProvider } from '../../src/ui/engine-context'

function renderWithEngine(words: string[], wpm = 300) {
  const tokens = words.map((w) => makeToken(w))
  const engine = createEngine(tokens, { wpm })
  render(
    <EngineProvider value={engine}>
      <TransportBar />
    </EngineProvider>,
  )
  return engine
}

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

  it('includes the page segment only when totalPages is given', () => {
    const tokens = [makeToken('a', { page: 0 }), makeToken('b', { page: 1 })]
    const engine = createEngine(tokens)
    render(
      <EngineProvider value={engine}>
        <TransportBar totalPages={5} />
      </EngineProvider>,
    )
    expect(screen.getByTestId('word-counter')).toHaveTextContent('page 1 / 5')
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
})
