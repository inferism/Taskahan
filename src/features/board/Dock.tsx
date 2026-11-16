import { Tabs } from '@/ui'

/** The right-hand dock: Chat for everyone, Logs for the leader. Contents arrive in 6.2 and 6.3. */
export function Dock({ leader }: { leader: boolean }) {
  const items = [{ value: 'chat', label: 'Chat', content: <ChatPane /> }]
  if (leader) items.push({ value: 'logs', label: 'Logs', content: <LogsPane /> })
  return (
    <section aria-label="Chat and logs" className="flex min-h-0 flex-1 flex-col">
      <Tabs label="Chat and logs" items={items} />
    </section>
  )
}

export function ChatPane() {
  return <p className="px-4 text-body text-muted">Group chat will appear here.</p>
}

export function LogsPane() {
  return <p className="px-4 text-body text-muted">Every change in the group will appear here.</p>
}
