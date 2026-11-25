import { useSyncExternalStore } from 'react'
import { Switch } from '@/components/Switch'
import { flags, FLAGS, type Flag } from '@/lib/flags'
import { Row } from './SettingsControls'

/** A switch in Settings → Advanced for each unfinished feature, on for this
 * device only. Nothing while there are none. */
export function ExperimentalFlags() {
  const enabled = useSyncExternalStore(flags.subscribe, flags.snapshot)
  const all = Object.entries(FLAGS) as [Flag, { description: string }][]

  // No unfinished feature to offer: nothing to show.
  if (all.length === 0) return null
  return (
    <>
      {all.map(([flag, info]) => (
        <Row
          key={flag}
          title={info.description}
          hint="Experimental: it may change or lose what it stores."
        >
          <Switch
            label={info.description}
            checked={enabled.has(flag)}
            onChange={(on) => flags.setEnabled(flag, on)}
          />
        </Row>
      ))}
    </>
  )
}
