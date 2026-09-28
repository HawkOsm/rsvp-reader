import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { LibraryScreen } from './ui/screens/LibraryScreen'
import { ReaderScreen } from './ui/screens/ReaderScreen'
import { SearchScreen } from './ui/screens/SearchScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { UpdatePrompt } from './ui/components/UpdatePrompt'
import { useGlobalShortcuts } from './ui/hooks/useKeyboardShortcuts'
import { useAppStore } from './ui/store'

function AppRoutes() {
  useGlobalShortcuts()
  return (
    <Routes>
      <Route path="/" element={<LibraryScreen />} />
      <Route path="/reader/:bookId" element={<ReaderScreen />} />
      <Route path="/search" element={<SearchScreen />} />
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

  if (!settingsLoaded) {
    return <div className="min-h-screen bg-[var(--color-bg)]" />
  }

  return (
    <HashRouter>
      <AppRoutes />
      <UpdatePrompt />
    </HashRouter>
  )
}

export default App
