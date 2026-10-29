import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteBooks } from '@/features/library/components/RemoteBooks'
import { flags } from '@/lib/flags'
import { useSyncStore } from '@/stores/sync-store'

const BOOKS = [
  { syncId: 'a', title: 'Emma', formatId: 'epub', totalWords: 160_000, available: true },
  { syncId: 'b', title: 'Persuasion', formatId: 'pdf', totalWords: 83_000, available: false },
]

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

function renderList() {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<RemoteBooks />} />
        <Route path="/reader/:id" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => flags.setEnabled('sync', false))

describe('RemoteBooks', () => {
  it('shows nothing with the sync flag off', () => {
    useSyncStore.setState({ remoteBooks: BOOKS })
    renderList()
    expect(screen.queryByText('On your other devices')).not.toBeInTheDocument()
  })

  it('lists other devices’ books, and opens one once downloaded', async () => {
    flags.setEnabled('sync', true)
    const downloadBook = vi.fn(async () => 42)
    useSyncStore.setState({ remoteBooks: BOOKS, downloadBook })
    renderList()
    expect(screen.getByText('EPUB · 160,000 words')).toBeInTheDocument()
    expect(screen.getByText('Not uploaded yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download Persuasion' })).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Download Emma' }))
    expect(downloadBook).toHaveBeenCalledWith('a')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/reader/42'))
  })

  it('says why a download failed', async () => {
    flags.setEnabled('sync', true)
    const downloadBook = vi.fn(async () => {
      throw new Error('Google Drive couldn’t be reached.')
    })
    useSyncStore.setState({ remoteBooks: BOOKS, downloadBook })
    renderList()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download Emma' }))
    expect(await screen.findByText('Google Drive couldn’t be reached.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download Emma' })).toBeEnabled()
  })
})
