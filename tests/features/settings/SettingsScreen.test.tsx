import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from '@/features/settings/components/SettingsScreen'
import { flags } from '@/lib/flags'
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

    await user.click(screen.getByRole('switch', { name: 'Show keyboard hints in the reader' }))

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
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).not.toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Tabs' })
    expect(within(tabs).getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(within(tabs).getByRole('button', { name: 'Shelves' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/?tab=shelves')
    vi.unstubAllGlobals()
  })

  it('picks a theme from its card, and a focus letter colour once custom is on', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    await user.click(
      within(screen.getByRole('group', { name: 'Theme' })).getByRole('button', { name: /Paper/ }),
    )
    expect(useAppStore.getState().theme).toBe('paper')

    expect(screen.queryByRole('group', { name: 'Focus letter colour' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Custom focus letter colour' }))
    await user.click(screen.getByRole('button', { name: 'Amber' }))
    expect(useAppStore.getState().orpColor).toBe('#f5a524')
    await user.click(screen.getByRole('switch', { name: 'Custom focus letter colour' }))
    expect(useAppStore.getState().orpColor).toBeNull()
  })

  it('steps the word size and the starting speed', async () => {
    useAppStore.setState({ fontSize: 56, defaultWpm: 300 })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Larger' }))
    expect(useAppStore.getState().fontSize).toBe(60)
    await user.click(
      within(screen.getByRole('group', { name: 'Starting speed' })).getByRole('button', {
        name: 'Faster',
      }),
    )
    expect(useAppStore.getState().defaultWpm).toBe(325)
  })

  it('on a phone, opens Word display on its own page and comes back', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    useAppStore.setState({ fontSize: 56 })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /Word display/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Word display')
    expect(screen.getByRole('group', { name: 'Typeface' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Tabs' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings')
    expect(screen.getByRole('button', { name: /Word display/ })).toHaveTextContent('Inter · 56 px')
    vi.unstubAllGlobals()
  })

  it('shows Sync only with the sync flag on', () => {
    flags.setEnabled('sync', false)
    const { unmount } = render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('heading', { name: 'Sync' })).not.toBeInTheDocument()
    expect(screen.getByText(/No account and no sync/)).toBeInTheDocument()
    unmount()

    flags.setEnabled('sync', true)
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Sync' })).toBeInTheDocument()
    expect(screen.queryByText(/No account and no sync/)).not.toBeInTheDocument()
    flags.setEnabled('sync', false)
  })
})
