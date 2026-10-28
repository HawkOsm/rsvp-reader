import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncLog } from '@/features/settings/components/SyncLog'
import { addSyncRun, saveSeenDevices } from '@/lib/sync-runs'

beforeEach(() => localStorage.clear())

describe('SyncLog', () => {
  it('lists recent runs newest first, the devices seen, and copies it all', async () => {
    addSyncRun({ at: 1000, ms: 80, outcome: 'synced', sent: 2, received: 1, skewed: 0 })
    addSyncRun({
      at: 2000,
      ms: 5,
      outcome: 'offline',
      sent: 0,
      received: 0,
      skewed: 0,
      error: 'Google Drive couldn’t be reached.',
    })
    saveSeenDevices([{ device: 'd2', name: 'Chrome on Android', lastSeen: 1500 }])
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<SyncLog />)

    const runs = within(screen.getByRole('list', { name: 'Sync runs' })).getAllByRole('listitem')
    expect(runs.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Offline.*sent 0 · received 0.*couldn’t be reached/),
      expect.stringMatching(/^Synced.*sent 2 · received 1/),
    ])
    expect(screen.getByRole('list', { name: 'Other devices' })).toHaveTextContent(
      'Chrome on Android',
    )
    await waitFor(() => expect(screen.getByText(/^This device:/)).not.toHaveTextContent('…'))

    // A plain click: user-event would put its own clipboard in place.
    fireEvent.click(screen.getByRole('button', { name: 'Copy log' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Chrome on Android'))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
