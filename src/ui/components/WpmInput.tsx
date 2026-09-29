import { useEffect, useState } from 'react'
import { MAX_WPM, MIN_WPM } from '../../core/pacing'

export interface WpmInputProps {
  value: number
  onCommit: (wpm: number) => void
  className?: string
}

/**
 * A number field that lets you actually type. The naive version — clamp to
 * [MIN_WPM, MAX_WPM] inside onChange — rewrites the field on every
 * keystroke, so typing "150" is impossible: "1" is instantly forced to 50.
 * Instead the text you type is a local draft; it's committed live as soon
 * as it is already a valid WPM (so the rate still updates while you type),
 * and clamped only when you finish — blur or Enter.
 */
export function WpmInput({ value, onCommit, className }: WpmInputProps) {
  const [draft, setDraft] = useState(String(value))

  // Follow changes made elsewhere (arrow-key shortcuts, another control).
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  function finish() {
    const parsed = Math.round(Number(draft))
    if (draft.trim() === '' || Number.isNaN(parsed)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.max(MIN_WPM, Math.min(MAX_WPM, parsed))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <input
      type="number"
      min={MIN_WPM}
      max={MAX_WPM}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = Number(e.target.value)
        if (
          e.target.value.trim() !== '' &&
          Number.isInteger(parsed) &&
          parsed >= MIN_WPM &&
          parsed <= MAX_WPM
        ) {
          onCommit(parsed)
        }
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish()
      }}
      className={className}
    />
  )
}
