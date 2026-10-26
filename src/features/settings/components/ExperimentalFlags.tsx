import { useSyncExternalStore } from 'react'
import { Switch } from '@/components/Switch'
import { flags, FLAGS, type Flag } from '@/lib/flags'
import { Row } from './SettingsControls'

/** Settings → Experimental: unfinished features, switched on for this device
 * only. */
export function ExperimentalFlags() {
  const enabled = useSyncExternalStore(flags.subscribe, flags.snapshot)
  const all = Object.entries(FLAGS) as [Flag, { description: string }][]

  if (all.length === 0) {
    return (
      <Row title="Experimental features" hint="Unfinished features you can try on this device.">
        <span className="text-[13px] text-text-dim">None right now</span>
      </Row>
    )
  }
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
