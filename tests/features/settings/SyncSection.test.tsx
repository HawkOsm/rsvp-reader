import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncSection } from '@/features/settings/components/SyncSection'
import { useSyncStore } from '@/stores/sync-store'

const LINK = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=s'

afterEach(() => useSyncStore.setState({ signInLink: null, signInCode: null, auth: null }))

describe('SyncSection', () => {
  it('offers the sign-in link only while a sign-in waits, and copies it', async () => {
    useSyncStore.setState({ auth: 'signed-out', signInLink: null })
    const { rerender } = render(<SyncSection />)
    expect(screen.queryByRole('button', { name: 'Copy sign-in link' })).not.toBeInTheDocument()

    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    useSyncStore.setState({ auth: 'signing-in', signInLink: LINK })
    rerender(<SyncSection />)
    expect(screen.getByText(/privacy extension/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy sign-in link' }))
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('shows the link to copy by hand when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => Promise.reject(new Error('denied')) },
      configurable: true,
    })
    useSyncStore.setState({ auth: 'signing-in', signInLink: LINK })
    render(<SyncSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy sign-in link' }))
    expect(await screen.findByRole('textbox', { name: 'Sign-in link' })).toHaveValue(LINK)
  })

  it('shows the code to enter, and where, when sign-in is by code', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    useSyncStore.setState({
      auth: 'signing-in',
      signInLink: 'https://www.google.com/device',
      signInCode: 'ABCD-EFGH',
    })
    render(<SyncSection />)
    expect(screen.getByLabelText('Sign-in code')).toHaveTextContent('ABCD-EFGH')
    expect(screen.getByRole('link', { name: 'google.com/device' })).toHaveAttribute(
      'href',
      'https://www.google.com/device',
    )
    expect(screen.queryByRole('button', { name: 'Copy sign-in link' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
