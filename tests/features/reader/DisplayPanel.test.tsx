import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DisplayPanel } from '@/features/reader/components/DisplayPanel'
import { MAX_FONT_SIZE } from '@/lib/fonts'
import { useAppStore } from '@/stores/app-store'

beforeEach(() => {
  useAppStore.setState({ theme: 'system', fontSize: 56 })
})

describe('DisplayPanel', () => {
  it('opens from the Aa button and closes on a click elsewhere', async () => {
    const user = userEvent.setup()
    render(
      <>
        <DisplayPanel />
        <p>outside</p>
      </>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Display' }))
    expect(screen.getByRole('dialog', { name: 'Display' })).toBeInTheDocument()
    await user.click(screen.getByText('outside'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('switches the theme, paper included', async () => {
    const user = userEvent.setup()
    render(<DisplayPanel />)
    await user.click(screen.getByRole('button', { name: 'Display' }))
    await user.click(screen.getByRole('button', { name: /Paper/ }))
    expect(useAppStore.getState().theme).toBe('paper')
    expect(document.documentElement.dataset.theme).toBe('paper')
    expect(screen.getByRole('button', { name: /Paper/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('steps the text size, and stops at the largest', async () => {
    const user = userEvent.setup()
    render(<DisplayPanel />)
    await user.click(screen.getByRole('button', { name: 'Display' }))
    await user.click(screen.getByRole('button', { name: 'Larger text' }))
    expect(useAppStore.getState().fontSize).toBe(60)
    useAppStore.setState({ fontSize: MAX_FONT_SIZE })
    await user.click(screen.getByRole('button', { name: 'Larger text' }))
    expect(useAppStore.getState().fontSize).toBe(MAX_FONT_SIZE)
  })
})
