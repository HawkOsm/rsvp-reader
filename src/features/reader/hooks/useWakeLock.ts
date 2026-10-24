import { useEffect } from 'react'
import { getPlatform, type ScreenLock } from '@/platform'

/** Keeps the screen on while `active`. The device may refuse, or let go when
 * the app is hidden; it is asked again when the app is visible again. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let lock: ScreenLock | null = null
    let cancelled = false

    async function acquire() {
      if (lock) return
      const platform = await getPlatform()
      const acquired = await platform.keepScreenOn()
      if (cancelled) acquired?.release()
      else lock = acquired
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void acquire()
      else lock = null // the system releases it when the app is hidden
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lock?.release()
      lock = null
    }
  }, [active])
}
