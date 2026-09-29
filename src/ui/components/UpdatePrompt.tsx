import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Button'

/**
 * "Prompt to update" per the plan: a new service-worker version never
 * silently reloads mid-read. Shows a small banner only once a new version
 * is actually waiting, or once the app is confirmed to work offline (a
 * one-time "you can go offline now" hint from the initial install).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh && !offlineReady) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-4 py-2 text-sm text-[var(--color-text)] shadow-lg">
        {needRefresh ? (
          <>
            <span>A new version is ready.</span>
            <Button
              onClick={() => void updateServiceWorker(true)}
              variant="primary"
            >
              Reload
            </Button>
            <Button
              onClick={() => setNeedRefresh(false)}
              variant="link"
            >
              Later
            </Button>
          </>
        ) : (
          <>
            <span>Ready to read offline.</span>
            <Button
              onClick={() => setOfflineReady(false)}
              variant="link"
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
