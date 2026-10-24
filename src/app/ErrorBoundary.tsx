import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { formatErrorLog, logError, readErrorLog } from '@/lib/error-log'

interface State {
  error: Error | null
}

/** Shows what went wrong instead of a blank screen. A crash while drawing a
 * screen would otherwise leave nothing but the background colour, and no way
 * to tell why. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(
      'screen',
      Object.assign(error, { stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` }),
    )
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-text">
        <p className="text-lg">Something went wrong on this screen.</p>
        <pre className="max-h-64 max-w-[90vw] overflow-auto rounded border border-border p-3 text-xs text-text-dim">
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <div className="flex gap-4">
          <Button
            variant="link"
            onClick={() => void navigator.clipboard?.writeText(formatErrorLog(readErrorLog()))}
          >
            Copy error details
          </Button>
          <a className="underline" href="#/" onClick={() => this.setState({ error: null })}>
            Back to the library
          </a>
        </div>
      </div>
    )
  }
}
