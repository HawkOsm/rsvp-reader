import { useEffect, useRef } from 'react'

/** Keeps the screen awake while `active` is true, via the Screen Wake Lock
 * API. Silently does nothing where it's unsupported (Safari < 16.4,
 * Tauri/Capacitor need their own platform plugin — see DECISIONS.md) —
 * losing the wake lock is an inconvenience, not a correctness issue. */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || !navigator.wakeLock) return

    let cancelled = false
    navigator.wakeLock
      .request('screen')
      .then((lock) => {
        if (cancelled) {
          void lock.release()
          return
        }
        lockRef.current = lock
      })
      .catch(() => {
        // Refused (e.g. the tab isn't visible yet) — nothing to do.
      })

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !lockRef.current && active) {
        navigator.wakeLock
          ?.request('screen')
          .then((lock) => {
            lockRef.current = lock
          })
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void lockRef.current?.release()
      lockRef.current = null
    }
  }, [active])
}
