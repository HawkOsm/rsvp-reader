import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReaderMenu } from '@/features/reader/components/ReaderMenu'

describe('ReaderMenu', () => {
  it('opens to show its controls, and closes once one is chosen', async () => {
    const chosen = vi.fn()
    const user = userEvent.setup()
    render(
      <ReaderMenu>
        <button type="button" onClick={chosen}>
          Add bookmark
        </button>
      </ReaderMenu>,
    )
    expect(screen.queryByRole('button', { name: 'Add bookmark' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reader menu' }))
    await user.click(screen.getByRole('button', { name: 'Add bookmark' }))
    expect(chosen).toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Reader controls' })).not.toBeInTheDocument()
  })

  it('closes on Escape and on a tap elsewhere', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ReaderMenu>
          <span>controls</span>
        </ReaderMenu>
        <p>elsewhere</p>
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Reader menu' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByText('controls')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reader menu' }))
    await user.click(screen.getByText('elsewhere'))
    expect(screen.queryByText('controls')).not.toBeInTheDocument()
  })
})
