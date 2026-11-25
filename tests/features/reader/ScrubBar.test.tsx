import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createEngine } from '@/core/engine'
import { makeToken } from '@/core/types'
import { ScrubBar } from '@/features/reader/components/ScrubBar'
import { EngineProvider } from '@/features/reader/engine-context'

function renderBar() {
  const engine = createEngine(
    Array.from({ length: 100 }, (_, i) => makeToken(`w${i}`)),
    { setTimer: () => 0, clearTimer: () => {} },
  )
  render(
    <EngineProvider value={engine}>
      <ScrubBar />
    </EngineProvider>,
  )
  return { engine, slider: screen.getByRole('slider', { name: 'Scrub' }) }
}

describe('ScrubBar', () => {
  it('stops the words for a drag, and goes on from where it is let go', () => {
    const { engine, slider } = renderBar()
    engine.play()
    fireEvent.pointerDown(slider)
    expect(engine.isPlaying).toBe(false) // nothing moves the knob but the finger
    fireEvent.change(slider, { target: { value: '60' } })
    expect(engine.index).toBe(60)
    fireEvent.pointerUp(slider)
    expect(engine.isPlaying).toBe(true)
    expect(engine.index).toBe(60)
  })

  it('leaves a paused book paused after a drag', () => {
    const { engine, slider } = renderBar()
    fireEvent.pointerDown(slider)
    fireEvent.change(slider, { target: { value: '30' } })
    fireEvent.pointerUp(slider)
    expect(engine.isPlaying).toBe(false)
    expect(engine.index).toBe(30)
  })
})
