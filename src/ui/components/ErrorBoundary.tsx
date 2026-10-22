import { Component, type ErrorInfo, type ReactNode } from 'react'

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
    console.error('Screen crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
        <p className="text-lg">Something went wrong on this screen.</p>
        <pre className="max-h-64 max-w-[90vw] overflow-auto rounded border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-dim)]">
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <a className="underline" href="#/" onClick={() => this.setState({ error: null })}>
          Back to the library
        </a>
      </div>
    )
  }
}
