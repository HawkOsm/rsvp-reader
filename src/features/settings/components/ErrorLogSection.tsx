import { useState } from 'react'
import { Button } from '@/components/Button'
import { clearErrorLog, formatErrorLog, readErrorLog } from '@/lib/error-log'

/** Settings → Error log: what went wrong recently, kept on this device only. */
export function ErrorLogSection() {
  const [entries, setEntries] = useState(readErrorLog)
  const [copied, setCopied] = useState(false)

  return (
    <section className="flex max-w-xl flex-col gap-2 border-t border-border pt-4 text-sm">
      <h2 className="text-base font-medium">Error log</h2>
      {entries.length === 0 ? (
        <p className="text-text-dim">Nothing has gone wrong.</p>
      ) : (
        <>
          <p className="text-text-dim">
            {entries.length} recent {entries.length === 1 ? 'error' : 'errors'}, kept on this device
            only. Copy them into a bug report to say what broke.
          </p>
          <pre
            aria-label="Error log"
            className="max-h-48 overflow-auto rounded border border-border p-2 text-xs text-text-dim"
          >
            {formatErrorLog(entries.slice(-5))}
          </pre>
          <div className="flex gap-4">
            <Button
              variant="link"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(formatErrorLog(entries))
                  .then(() => setCopied(true))
              }
            >
              {copied ? 'Copied' : 'Copy all'}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearErrorLog()
                setEntries([])
              }}
            >
              Clear
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
