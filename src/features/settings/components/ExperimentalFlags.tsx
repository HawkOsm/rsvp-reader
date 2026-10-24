import { useSyncExternalStore } from 'react'
import { flags, FLAGS, type Flag } from '@/lib/flags'

/** Settings → Experimental: unfinished features, switched on for this device
 * only. Not shown at all while there are none. */
export function ExperimentalFlags() {
  const enabled = useSyncExternalStore(flags.subscribe, flags.snapshot)
  const all = Object.entries(FLAGS) as [Flag, { description: string }][]
  if (all.length === 0) return null

  return (
    <section className="flex max-w-md flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-base font-medium">Experimental</h2>
      <p className="text-sm text-text-dim">
        Unfinished features, for trying out. They may change or lose what they store.
      </p>
      {all.map(([flag, info]) => (
        <label key={flag} className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled.has(flag)}
            onChange={(e) => flags.setEnabled(flag, e.target.checked)}
          />
          {info.description}
        </label>
      ))}
    </section>
  )
}
