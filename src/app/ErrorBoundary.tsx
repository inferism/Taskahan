import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/ui'

interface Props {
  children: ReactNode
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen max-w-[360px] flex-col justify-center gap-4 p-4">
        <h1 className="font-display text-name font-bold uppercase tracking-[0.02em]">
          Something went wrong
        </h1>
        <p>Reload the page to try again. If it keeps happening, log out and back in.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </main>
    )
  }
}
