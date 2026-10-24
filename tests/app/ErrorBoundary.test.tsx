import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/app/ErrorBoundary'

function Boom(): never {
  throw new Error('reader exploded')
}

describe('ErrorBoundary', () => {
  it('shows the screen when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('shows what went wrong instead of a blank screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
    expect(screen.getByText(/reader exploded/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /library/i })).toHaveAttribute('href', '#/')
  })
})
