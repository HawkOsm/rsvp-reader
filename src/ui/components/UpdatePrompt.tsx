import { useRegisterSW } from 'virtual:pwa-register/react'

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
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="rounded bg-[var(--color-accent)] px-3 py-1 font-medium text-[var(--color-bg)]"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="text-[var(--color-text-dim)]"
            >
              Later
            </button>
          </>
        ) : (
          <>
            <span>Ready to read offline.</span>
            <button
              type="button"
              onClick={() => setOfflineReady(false)}
              className="text-[var(--color-text-dim)]"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}
