import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  hasError: boolean
  message?: string
}

/** Catches render errors so a stray exception never blanks the screen mid-demo. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[Braze demo] Caught render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-8 text-center">
        <div className="max-w-sm rounded-2xl bg-white p-6 shadow-card">
          <h1 className="text-xl font-bold text-brand">Reloading…</h1>
          <p className="mt-2 text-sm text-muted">
            An unexpected error occurred. Tap below to reload the app.
          </p>
          {this.state.message && (
            <p className="mt-2 break-words font-mono text-[11px] text-muted/70">
              {this.state.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full rounded-full bg-brand py-3 text-sm font-bold text-white"
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
