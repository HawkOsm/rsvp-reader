import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '@/components/Dialog'

function renderDialog() {
  const onCancel = vi.fn()
  render(
    <Dialog label="Question" title="A title" description="Why it asks" onCancel={onCancel}>
      <button type="button">Answer</button>
    </Dialog>,
  )
  return onCancel
}

describe('Dialog', () => {
  it('is a labelled modal dialog with its title and description', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Question' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('A title')
    expect(dialog).toHaveTextContent('Why it asks')
  })

  it('cancels on Escape and on the backdrop, not on a click inside', () => {
    const onCancel = renderDialog()
    fireEvent.click(screen.getByText('Answer'))
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
