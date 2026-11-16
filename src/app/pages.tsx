import type { ReactNode } from 'react'

// Placeholder screens. Each is replaced by its feature task (4.x, ...).
function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-name font-bold uppercase tracking-[0.02em]">{title}</h1>
      {children}
    </main>
  )
}

export const SettingsPage = () => <Screen title="Settings" />
