import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { LibraryScreen } from '@/features/library/components/LibraryScreen'
import { ReaderScreen } from '@/features/reader/components/ReaderScreen'
import { SettingsScreen } from '@/features/settings/components/SettingsScreen'
import { ErrorBoundary } from './ErrorBoundary'
import { UpdatePrompt } from './UpdatePrompt'
import { useBackButton } from '@/app/hooks/useBackButton'
import { useGlobalShortcuts } from '@/app/hooks/useGlobalShortcuts'
import { useSystemChrome } from '@/app/hooks/useSystemChrome'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/stores/app-store'

function AppRoutes() {
  useGlobalShortcuts()
  useBackButton()
  return (
    <Routes>
      <Route path="/" element={<LibraryScreen />} />
      <Route path="/reader/:bookId" element={<ReaderScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
    </Routes>
  )
}

function App() {
  const loadSettings = useAppStore((s) => s.loadSettings)
  const settingsLoaded = useAppStore((s) => s.settingsLoaded)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useSystemChrome()

  // Only an app that updates itself registers a service worker: a native
  // build updates by reinstalling, and a worker there could keep serving the
  // old files after an upgrade.
  const [selfUpdates, setSelfUpdates] = useState(false)
  useEffect(() => {
    void getPlatform().then((platform) => setSelfUpdates(platform.selfUpdates))
  }, [])

  if (!settingsLoaded) {
    return <div className="min-h-screen bg-[var(--color-bg)]" />
  }

  return (
    <HashRouter>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      {selfUpdates && <UpdatePrompt />}
    </HashRouter>
  )
}

export default App
