import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { LibraryScreen } from '@/features/library/components/LibraryScreen'
import { ReaderScreen } from '@/features/reader/components/ReaderScreen'
import { SettingsScreen } from '@/features/settings/components/SettingsScreen'
import { ErrorBoundary } from './ErrorBoundary'
import { UpdatePrompt } from './UpdatePrompt'
import { useAndroidBackButton } from '@/app/hooks/useAndroidBackButton'
import { useGlobalShortcuts } from '@/app/hooks/useGlobalShortcuts'
import { useNativeAppearance } from '@/app/hooks/useNativeAppearance'
import { useAppStore } from '@/stores/app-store'

function AppRoutes() {
  useGlobalShortcuts()
  useAndroidBackButton()
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

  useNativeAppearance()

  if (!settingsLoaded) {
    return <div className="min-h-screen bg-[var(--color-bg)]" />
  }

  return (
    <HashRouter>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <UpdatePrompt />
    </HashRouter>
  )
}

export default App
