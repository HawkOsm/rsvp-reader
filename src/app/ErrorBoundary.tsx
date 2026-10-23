import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches a render error anywhere below it, so one broken screen shows a
 * way back to the library instead of a blank window. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-[var(--color-text)]"
      >
        <p>Something went wrong.</p>
        <p className="text-sm text-[var(--color-text-dim)]">{error.message}</p>
        <Button
          variant="primary"
          onClick={() => {
            window.location.hash = '#/'
            this.setState({ error: null })
          }}
        >
          Back to library
        </Button>
      </div>
    )
  }
}
