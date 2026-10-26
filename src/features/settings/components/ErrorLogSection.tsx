import { useState } from 'react'
import { clearErrorLog, formatErrorLog, readErrorLog } from '@/lib/error-log'
import { Row } from './SettingsControls'

const BUTTON =
  'h-9 rounded-[9px] border border-border px-3.5 text-[13px] hover:bg-bg-hover disabled:opacity-60 disabled:hover:bg-transparent'

/** Settings → Error log: what went wrong recently, kept on this device only. */
export function ErrorLogSection() {
  const [entries, setEntries] = useState(readErrorLog)
  const [copied, setCopied] = useState(false)
  const empty = entries.length === 0

  return (
    <>
      <Row
        title="Error log"
        hint={
          empty
            ? 'Nothing has gone wrong.'
            : `${entries.length} recent ${entries.length === 1 ? 'error' : 'errors'}, kept on this device only. Copy them into a bug report to say what broke.`
        }
      >
        <div className="flex gap-2">
          <button
            type="button"
            disabled={empty}
            className={BUTTON}
            onClick={() =>
              void navigator.clipboard
                ?.writeText(formatErrorLog(entries))
                .then(() => setCopied(true))
            }
          >
            {copied ? 'Copied' : 'Copy all'}
          </button>
          <button
            type="button"
            disabled={empty}
            className={`${BUTTON} hover:text-accent`}
            onClick={() => {
              clearErrorLog()
              setEntries([])
            }}
          >
            Clear
          </button>
        </div>
      </Row>
      {!empty && (
        <div className="px-[18px] py-3.5">
          <pre
            aria-label="Error log"
            className="max-h-48 overflow-auto rounded-lg bg-bg p-3 text-xs text-text-dim"
          >
            {formatErrorLog(entries.slice(-5))}
          </pre>
        </div>
      )}
    </>
  )
}
