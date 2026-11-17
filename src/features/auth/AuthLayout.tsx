import type { ReactNode } from 'react'
import { Link } from 'react-router'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground">
      <header className="mx-auto max-w-7xl px-6 py-6">
        <Link to="/" className="workspace-brand">
          Taskahan
        </Link>
      </header>
      <main className="mx-auto flex max-w-[420px] flex-col gap-6 px-6 pt-8 pb-16 sm:pt-16">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-[32px] font-medium tracking-tight">{title}</h1>
            <p className="mt-2 text-body text-muted">
              {title === 'Log in'
                ? 'Pick up where your group left off.'
                : 'Start a group or join your people with a code.'}
            </p>
          </div>
          {children}
          <Link to="/" className="text-body text-muted hover:text-ink">
            ← Back to Taskahan
          </Link>
        </div>
      </main>
    </div>
  )
}
