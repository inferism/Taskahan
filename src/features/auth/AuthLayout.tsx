import type { ReactNode } from 'react'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-ground px-4 pt-16">
      <div className="flex w-full max-w-[360px] flex-col gap-6">
        <p className="font-display text-name font-bold uppercase tracking-[0.02em]">Taskahan</p>
        <h1 className="font-display text-name font-bold uppercase tracking-[0.02em]">{title}</h1>
        {children}
      </div>
    </main>
  )
}
