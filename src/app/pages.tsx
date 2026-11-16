import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { supabase } from '@/lib/supabase'
import { Button } from '@/ui'

// Placeholder screens. Each is replaced by its feature task (1.7, 3.x, 4.x, ...).
function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-name font-bold uppercase tracking-[0.02em]">{title}</h1>
      {children}
    </main>
  )
}

export const HomePage = () => (
  <Screen title="Your groups">
    {/* Temporary until Settings (log out) is built. */}
    <Button className="mt-4" onClick={() => void supabase.auth.signOut()}>
      Log out
    </Button>
  </Screen>
)
export const SettingsPage = () => <Screen title="Settings" />
export function BoardPage() {
  const { groupId, number } = useParams()
  return (
    <Screen title="Board">
      <p>
        Group {groupId}
        {number ? `, task #${number}` : ''}
      </p>
    </Screen>
  )
}
