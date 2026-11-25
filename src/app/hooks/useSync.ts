import { useEffect } from 'react'
import { useSyncStore } from '@/stores/sync-store'

/** Sync with Google Drive while the app is open. Until the user connects
 * Drive in Settings nothing is sent or fetched: a sync run does nothing
 * unless signed in. */
export function useSync(): void {
  const start = useSyncStore((s) => s.start)
  useEffect(() => start(), [start])
}
