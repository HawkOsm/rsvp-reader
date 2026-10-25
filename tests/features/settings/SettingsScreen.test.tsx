import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
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

  it('on a phone, has the tab bar instead of a back link, and Shelves opens the library’s', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    function Where() {
      const location = useLocation()
      return <div data-testid="where">{location.pathname + location.search}</div>
    }
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: '← Library' })).not.toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Tabs' })
    expect(within(tabs).getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(within(tabs).getByRole('button', { name: 'Shelves' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/?tab=shelves')
    vi.unstubAllGlobals()
  })
})
