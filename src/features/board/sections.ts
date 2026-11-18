import { ChartNoAxesColumn, Columns3, MessageSquare, ScrollText } from 'lucide-react'

export type BoardSection = 'board' | 'progress' | 'chat' | 'logs'

export const boardSections: { value: BoardSection; label: string; icon: typeof Columns3 }[] = [
  { value: 'board', label: 'Board', icon: Columns3 },
  { value: 'progress', label: 'Progress', icon: ChartNoAxesColumn },
  { value: 'chat', label: 'Chat', icon: MessageSquare },
  { value: 'logs', label: 'Logs', icon: ScrollText },
]
