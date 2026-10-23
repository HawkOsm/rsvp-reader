import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { LibraryScreen } from '@/features/library/components/LibraryScreen'
import { useAppStore } from '@/stores/app-store'
import { ErrorBoundary } from './ErrorBoundary'
import { useAndroidBackButton } from './hooks/useAndroidBackButton'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useNativeAppearance } from './hooks/useNativeAppearance'
import { UpdatePrompt } from './UpdatePrompt'

// The library is the first screen, so it loads with the app. The reader
// (pdf.js and all) and settings load when first visited.
const ReaderScreen = lazy(() =>
  import('@/features/reader/components/ReaderScreen').then((m) => ({ default: m.ReaderScreen })),
)
const SettingsScreen = lazy(() =>
  import('@/features/settings/components/SettingsScreen').then((m) => ({
    default: m.SettingsScreen,
  })),
)

const blank = <div className="min-h-screen bg-[var(--color-bg)]" />

function AppRoutes() {
  useGlobalShortcuts()
  useAndroidBackButton()
  return (
    <Suspense fallback={blank}>
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/reader/:bookId" element={<ReaderScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Routes>
    </Suspense>
  )
}

function App() {
  const loadSettings = useAppStore((s) => s.loadSettings)
  const settingsLoaded = useAppStore((s) => s.settingsLoaded)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useNativeAppearance()

  if (!settingsLoaded) return blank

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
