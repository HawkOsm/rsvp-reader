import { useEffect } from 'react'
import { useFlag } from '@/lib/flags'
import { useSyncStore } from '@/stores/sync-store'

/** Sync with Google Drive while the app is open, with the `sync` flag on.
 * With it off nothing starts, so the app makes no network call. */
export function useSync(): void {
  const on = useFlag('sync')
  const start = useSyncStore((s) => s.start)
  useEffect(() => (on ? start() : undefined), [on, start])
}
