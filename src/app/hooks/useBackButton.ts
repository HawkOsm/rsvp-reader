import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { backAction } from '@/app/back-button'
import { dismissTop } from '@/lib/dismiss'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/stores/app-store'

/** The system back button (Android): it first closes whatever lies over
 * the screen (`lib/dismiss.ts`), and otherwise follows `backAction`. Mounted once
 * at the app root, since it needs both the route and the panel state. */
export function useBackButton(): void {
  const location = useLocation()
  const navigate = useNavigate()
  const panelOpen = useAppStore((s) => s.panelOpen)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)

  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void getPlatform().then((platform) => {
      if (cancelled) return
      stop = platform.onBackButton(() => {
        // A panel lying over the screen closes first.
        if (dismissTop()) return
        const action = backAction(location.pathname, panelOpen)
        if (action === 'close-panel') setPanelOpen(false)
        else if (action === 'to-library') navigate('/')
        else platform.exit()
      })
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [location.pathname, panelOpen, navigate, setPanelOpen])
}
