import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SettingsScreen } from '@/features/settings/components/SettingsScreen'
import { getSetting } from '@/storage/settings'
import { getDb } from '@/storage/schema'
import { useAppStore } from '@/stores/app-store'

describe('SettingsScreen', () => {
  it('turns the reader’s keyboard hints off, and remembers it', async () => {
    expect(useAppStore.getState().showHints).toBe(true)
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Show keyboard hints in the reader' }))

    expect(useAppStore.getState().showHints).toBe(false)
    await waitFor(async () => expect(await getSetting(getDb(), 'showHints', true)).toBe(false))
  })
})
