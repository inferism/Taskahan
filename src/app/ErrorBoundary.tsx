import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { useRouteError } from 'react-router'
import { Button } from '@/ui'

/** The recovery screen shown for any crash, inside or outside the router. */
export function ErrorScreen() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[360px] flex-col justify-center gap-4 p-4">
      <h1 className="text-name font-medium tracking-tight">
        Something went wrong
      </h1>
      <p>Reload the page to try again. If it keeps happening, log out and back in.</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </main>
  )
}

/** Router `errorElement`: React Router catches route errors before ErrorBoundary sees them. */
export function RouteError() {
  const error = useRouteError()
  useEffect(() => console.error(error), [error])
  return <ErrorScreen />
}

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
    return this.state.failed ? <ErrorScreen /> : this.props.children
  }
}
