import { ChatPane } from '@/features/chat/ChatPane'
import { LogsPane } from '@/features/logs/LogsPane'
import { Tabs } from '@/ui'
import type { Board } from './api'
import { amLeader } from './selectors'

/** The right-hand dock: Chat for everyone, Logs for the leader. */
export function Dock({ board, defaultTab }: { board: Board; defaultTab?: 'logs' | 'chat' }) {
  const items = [{ value: 'chat', label: 'Chat', content: <ChatPane board={board} /> }]
  if (amLeader(board))
    items.push({ value: 'logs', label: 'Logs', content: <LogsPane board={board} /> })
  return (
    <section aria-label="Chat and logs" className="flex min-h-0 flex-1 flex-col">
      <Tabs label="Chat and logs" items={items} defaultValue={defaultTab} fill />
    </section>
  )
}

export { ChatPane, LogsPane }
