import { useEffect, useState } from 'react'
import type { ContentLayout } from '@/core/types'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import {
  acceptProgressOffer,
  declineProgressOffer,
  progressOfferFor,
  type ProgressOffer,
} from '@/features/reader/api/sync'
import { useEngine } from '@/features/reader/engine-context'
import { offerMessage } from '@/features/reader/offer-text'
import { logError } from '@/lib/error-log'
import { useFlag } from '@/lib/flags'
import { readSeenDevices } from '@/lib/sync-runs'
import { useAppStore } from '@/stores/app-store'
import { useSyncStore } from '@/stores/sync-store'

/** "Your phone is 3 pages further on. Jump there?" The reader never moves
 * to another device's place without being asked (docs/architecture/sync.md,
 * decision 7). Staying is saving this device's place again, which makes it
 * the newer one everywhere. */
export function PositionOffer({ bookId, layout }: { bookId: number; layout: ContentLayout }) {
  const sync = useFlag('sync')
  const revision = useSyncStore((s) => s.revision)
  const engine = useEngine()
  const [offer, setOffer] = useState<ProgressOffer | null>(null)

  useEffect(() => {
    if (!sync) return
    let current = true
    progressOfferFor(bookId)
      .then((found) => current && setOffer(found))
      .catch((err: unknown) => logError('sync: offer', err))
    return () => {
      current = false
    }
  }, [sync, bookId, revision])

  if (!sync || !offer || offer.progress.wordIndex === engine.index) return null
  const device = readSeenDevices().find((d) => d.device === offer.device)?.name ?? 'Another device'

  const jump = () => {
    setOffer(null)
    engine.seek(offer.progress.wordIndex)
    acceptProgressOffer(offer).catch((err: unknown) => logError('sync: offer', err))
  }
  const stay = () => {
    setOffer(null)
    const mode = useAppStore.getState().mode
    declineProgressOffer(offer, { wordIndex: engine.index, wpm: engine.wpm, mode }).catch(
      (err: unknown) => logError('sync: offer', err),
    )
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-bg-raised px-3 py-1.5 text-sm"
    >
      <span>
        {offerMessage(device, engine.index, offer.progress.wordIndex, layout, engine.tokens)} Jump
        there?
      </span>
      <span className="flex items-center gap-1">
        <Button variant="primary" onClick={jump}>
          Jump there
        </Button>
        <button
          type="button"
          aria-label="Stay here"
          title="Stay here"
          onClick={stay}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-dim hover:bg-bg-hover hover:text-text"
        >
          <Icon name="close" size={16} />
        </button>
      </span>
    </div>
  )
}
