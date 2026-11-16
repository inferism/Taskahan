import { Check, ChevronDown, Copy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { DropdownMenu } from 'radix-ui'
import { purposeText, useGroups } from '@/features/home/api'
import { supabase } from '@/lib/supabase'
import type { Layout } from '@/lib/useLayout'
import { Avatar, cn, useToast } from '@/ui'
import { avatarUrl, type Board, type Member } from './api'

export type Panel = 'progress' | 'chat'

export interface TopBarProps {
  board: Board
  me: Member | undefined
  layout: Layout
  /** Tablet only: which slide-over panel is open. */
  panel: Panel | null
  onPanel: (panel: Panel | null) => void
  /** Active members online right now. */
  onlineCount: number
  /** Leader only. On phones the button sits above the tab bar instead. */
  onAddTask?: () => void
}

const barButton =
  'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-body font-semibold text-white hover:bg-white/15 focus-visible:outline-yellow'

const menuContent =
  'z-50 min-w-48 rounded-lg border border-line bg-surface p-1 text-body text-ink shadow-overlay'
const menuItem =
  'flex h-10 cursor-pointer items-center gap-2 rounded-md px-3 outline-none data-[highlighted]:bg-sunken'

function GroupSwitcher({ board, layout }: { board: Board; layout: Layout }) {
  const groups = useGroups()
  const { group } = board
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(barButton, 'min-w-0 bg-court-deep')}
        aria-label={`Group: ${group.name}. Switch group`}
      >
        <span className="truncate">{group.name}</span>
        {layout !== 'phone' && (
          <span className="rounded-full bg-white/15 px-2 text-label font-medium whitespace-nowrap">
            {purposeText(group.purpose, group.purpose_note)}
          </span>
        )}
        <ChevronDown size={20} strokeWidth={1.75} aria-hidden className="shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={menuContent}>
          {(groups.data ?? []).map((g) => (
            <DropdownMenu.Item key={g.id} asChild className={menuItem}>
              <Link to={`/g/${g.id}`} aria-current={g.id === group.id ? 'page' : undefined}>
                <span className="flex-1 truncate">{g.name}</span>
                {g.id === group.id && <Check size={20} strokeWidth={1.75} aria-hidden />}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={menuItem}>
            <Link to="/">All groups</Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function JoinCode({ code, compact }: { code: string; compact: boolean }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast('Join code copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast(`Join code: ${code}`)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={barButton}
      aria-label={`Copy join code ${code}`}
    >
      {!compact && (
        <span className="font-display text-title font-bold tracking-[0.18em]">{code}</span>
      )}
      {copied ? (
        <Check size={20} strokeWidth={1.75} aria-hidden />
      ) : (
        <Copy size={20} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  )
}

function AccountMenu({ me }: { me: Member | undefined }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="rounded-md" aria-label="Account menu">
        {me ? (
          <Avatar seat={me.seat} name={me.display_name} photoUrl={avatarUrl(me.avatar_path)} />
        ) : (
          <span className="block size-9 rounded-md bg-white/15" />
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuContent}>
          <DropdownMenu.Item asChild className={menuItem}>
            <Link to="/settings">Settings</Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={() => void supabase.auth.signOut()}>
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** The 56px court-green bar. */
export function TopBar({ board, me, layout, panel, onPanel, onlineCount, onAddTask }: TopBarProps) {
  const toggle = (p: Panel) => onPanel(panel === p ? null : p)
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 bg-bar px-4 text-white md:gap-3 md:px-6">
      {layout !== 'phone' && (
        <Link
          to="/"
          className="font-display text-name font-bold uppercase tracking-[0.02em] focus-visible:outline-yellow"
        >
          Taskahan
        </Link>
      )}
      <GroupSwitcher board={board} layout={layout} />
      <JoinCode code={board.group.join_code} compact={layout === 'phone'} />
      <div className="ml-auto flex items-center gap-1">
        {layout === 'tablet' && (
          <>
            <button
              type="button"
              className={cn(barButton, panel === 'progress' && 'bg-white/15')}
              aria-expanded={panel === 'progress'}
              aria-controls="board-progress-panel"
              onClick={() => toggle('progress')}
            >
              Progress
            </button>
            <button
              type="button"
              className={cn(barButton, panel === 'chat' && 'bg-white/15')}
              aria-expanded={panel === 'chat'}
              aria-controls="board-chat-panel"
              onClick={() => toggle('chat')}
            >
              Chat
            </button>
          </>
        )}
        <span className="flex items-center gap-1.5 px-2 text-body whitespace-nowrap">
          <span aria-hidden className="size-2.5 rounded-full bg-done" />
          {onlineCount} online
        </span>
        {onAddTask && layout !== 'phone' && (
          <button
            type="button"
            className={cn(barButton, 'bg-yellow text-on-yellow hover:bg-yellow-hover')}
            onClick={onAddTask}
          >
            Add task
          </button>
        )}
        <span className="ml-1">
          <AccountMenu me={me} />
        </span>
      </div>
    </header>
  )
}
