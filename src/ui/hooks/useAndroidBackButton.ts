import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'

/**
 * "Close the page panel first, then leave the reader, then exit" — the
 * plan's exact back-button order for Android. Mounted once at the app
 * root (App.tsx), not per-screen, since it needs to know both the current
 * route and the panel state to decide which of the three it's doing.
 *
 * A no-op outside Capacitor's native Android shell: `App.addListener`
 * only ever fires there, and dynamically importing `@capacitor/app` keeps
 * it out of the web/Tauri bundles' critical path.
 */
export function useAndroidBackButton(): void {
  const location = useLocation()
  const navigate = useNavigate()
  const panelOpen = useAppStore((s) => s.panelOpen)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)

  useEffect(() => {
    let removeListener: (() => void) | undefined
    let cancelled = false

    void (async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform() || cancelled) return

      const { App } = await import('@capacitor/app')
      const handle = await App.addListener('backButton', () => {
        const inReader = location.pathname.startsWith('/reader/')
        if (inReader && panelOpen) {
          setPanelOpen(false)
        } else if (inReader) {
          navigate('/')
        } else if (location.pathname === '/') {
          void App.exitApp()
        } else {
          navigate('/')
        }
      })
      removeListener = () => void handle.remove()
    })()

    return () => {
      cancelled = true
      removeListener?.()
    }
  }, [location.pathname, panelOpen, navigate, setPanelOpen])
}
