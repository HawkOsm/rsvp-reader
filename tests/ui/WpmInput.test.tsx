import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WpmInput } from '../../src/ui/components/WpmInput'

function Harness({ initial = 300, onCommit }: { initial?: number; onCommit?: (n: number) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <WpmInput
      value={value}
      onCommit={(n) => {
        setValue(n)
        onCommit?.(n)
      }}
    />
  )
}

describe('WpmInput', () => {
  it('lets you type a value whose first digits are below the minimum (the "150" bug)', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '150')

    // Not rewritten to 50 after "1" or "15" — the typed text survives.
    expect(input).toHaveValue(150)
  })

  it('applies a valid value live, while still typing', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness onCommit={onCommit} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '450')

    expect(onCommit).toHaveBeenLastCalledWith(450)
  })

  it('does not commit an out-of-range value until you finish, then clamps it', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness onCommit={onCommit} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '9')
    expect(onCommit).not.toHaveBeenCalled() // 9 < 50: still mid-typing

    await user.tab() // blur -> clamp to MIN_WPM
    expect(onCommit).toHaveBeenLastCalledWith(50)
    expect(input).toHaveValue(50)
  })

  it('clamps too-large input to the maximum on Enter', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '9999{Enter}')

    expect(input).toHaveValue(1500)
  })

  it('restores the previous value if you leave the field empty', async () => {
    const user = userEvent.setup()
    render(<Harness initial={320} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.tab()

    expect(input).toHaveValue(320)
  })
})
