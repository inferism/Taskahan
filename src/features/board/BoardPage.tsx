import { ChartNoAxesColumn, Columns3, MessageSquare, ScrollText, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Roster } from '@/features/progress/Roster'
import { errorKey } from '@/features/home/api'
import { useLayout } from '@/lib/useLayout'
import { Avatar, Button, cn } from '@/ui'
import { avatarUrl, useBoard, useSetTaskStatus, type Board, type Task } from './api'
import { ChatPane, Dock, LogsPane } from './Dock'
import { MemberColumn } from './MemberColumn'
import { amLeader, canSetStatus, columnMembers, myMember, tasksByMember } from './selectors'
import { TopBar, type Panel } from './TopBar'

type PhoneTab = 'board' | 'progress' | 'chat' | 'logs'

export function BoardPage() {
  const { groupId = '' } = useParams()
  const board = useBoard(groupId)

  if (board.isPending) return <BoardLoading />
  if (board.isError) {
    return (
      <BoardProblem
        forbidden={errorKey(board.error) === 'forbidden'}
        onRetry={() => void board.refetch()}
      />
    )
  }
  return <BoardShell key={groupId} board={board.data} />
}

function BoardShell({ board }: { board: Board }) {
  const layout = useLayout()
  const members = useMemo(() => columnMembers(board), [board])
  const byMember = useMemo(() => tasksByMember(board), [board])
  const me = myMember(board)
  const leader = amLeader(board)
  const [now] = useState(() => new Date())

  const [expanded, setExpanded] = useState(board.me)
  // One open task per column, by member id.
  const [openTasks, setOpenTasks] = useState<Record<string, string | undefined>>({})
  const setStatus = useSetTaskStatus(board.group.id)
  const [chosenPanel, setPanel] = useState<Panel | null>(null)
  // Panels only exist on tablets.
  const panel = layout === 'tablet' ? chosenPanel : null
  const [tab, setTab] = useState<PhoneTab>('board')
  const [page, setPage] = useState(0)

  const columnRefs = useRef(new Map<string, HTMLElement>())
  const pagerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  const goToPage = useCallback((index: number, smooth = true) => {
    const pager = pagerRef.current
    if (!pager) return
    pager.scrollTo({ left: index * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
    setPage(index)
  }, [])

  /** Roster row: show that member's column, expanded. */
  const showMember = useCallback(
    (memberId: string) => {
      if (layout === 'phone') {
        setTab('board')
        const index = members.findIndex((m) => m.id === memberId)
        // The pager mounts again when the Board tab returns; wait a frame for it.
        requestAnimationFrame(() => goToPage(index, false))
        return
      }
      setExpanded(memberId)
      setPanel(null)
      requestAnimationFrame(() =>
        columnRefs.current
          .get(memberId)
          ?.scrollIntoView?.({ behavior: 'smooth', inline: 'nearest', block: 'nearest' }),
      )
    },
    [layout, members, goToPage],
  )

  const toggleTask = useCallback((task: Task) => {
    setExpanded(task.assignee_id)
    setOpenTasks((cur) => ({
      ...cur,
      [task.assignee_id]: cur[task.assignee_id] === task.id ? undefined : task.id,
    }))
  }, [])

  const roster = (
    <Roster members={members} tasksByMember={byMember} me={board.me} onSelect={showMember} />
  )

  const columns = members.map((m) => (
    <MemberColumn
      key={m.id}
      ref={(el) => {
        if (el) columnRefs.current.set(m.id, el)
        else columnRefs.current.delete(m.id)
      }}
      member={m}
      tasks={byMember.get(m.id) ?? []}
      isMe={m.id === board.me}
      expanded={layout === 'phone' || expanded === m.id}
      fullWidth={layout === 'phone'}
      now={now}
      onExpand={() => setExpanded(m.id)}
      openTaskId={openTasks[m.id]}
      onToggleTask={toggleTask}
      canSetStatus={(t) => canSetStatus(board, t)}
      onStatus={(t, status) => setStatus.mutate({ taskId: t.id, status })}
      failedTaskId={setStatus.isError ? setStatus.variables.taskId : undefined}
      onRetryStatus={() => setStatus.variables && setStatus.mutate(setStatus.variables)}
    />
  ))

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ground">
      <TopBar board={board} me={me} layout={layout} panel={panel} onPanel={setPanel} />

      {layout === 'desktop' && (
        <div className="grid min-h-0 flex-1 grid-cols-[288px_minmax(0,1fr)_336px]">
          <aside className="flex min-h-0 flex-col border-r border-line bg-surface">{roster}</aside>
          <BoardArea>{columns}</BoardArea>
          <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
            <Dock leader={leader} />
          </aside>
        </div>
      )}

      {layout === 'tablet' && (
        <div className="relative flex min-h-0 flex-1">
          <BoardArea>{columns}</BoardArea>
          <SlideOver
            id="board-progress-panel"
            side="left"
            label="Task Progress"
            open={panel === 'progress'}
            onClose={() => setPanel(null)}
          >
            {roster}
          </SlideOver>
          <SlideOver
            id="board-chat-panel"
            side="right"
            label="Chat and logs"
            open={panel === 'chat'}
            onClose={() => setPanel(null)}
          >
            <Dock leader={leader} />
          </SlideOver>
        </div>
      )}

      {layout === 'phone' && (
        <>
          <main className="flex min-h-0 flex-1 flex-col">
            {tab === 'board' && (
              <>
                <Pager board={board} members={members} page={page} onPage={(i) => goToPage(i)} />
                <div
                  ref={pagerRef}
                  onScroll={(e) => {
                    const el = e.currentTarget
                    if (el.clientWidth > 0) setPage(Math.round(el.scrollLeft / el.clientWidth))
                  }}
                  className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
                >
                  {columns}
                </div>
              </>
            )}
            {tab === 'progress' && (
              <div className="flex min-h-0 flex-1 flex-col bg-surface">{roster}</div>
            )}
            {tab === 'chat' && (
              <PhonePane title="Chat">
                <ChatPane />
              </PhonePane>
            )}
            {tab === 'logs' && leader && (
              <PhonePane title="Logs">
                <LogsPane />
              </PhonePane>
            )}
          </main>
          <BottomTabs tab={tab} onTab={setTab} leader={leader} />
        </>
      )}
    </div>
  )
}

/** The centre pane: columns side by side, scrolling sideways when they overflow. */
function BoardArea({ children }: { children: ReactNode }) {
  return (
    <main
      aria-label="Board"
      className="flex min-h-0 min-w-0 flex-1 items-start gap-3 overflow-x-auto p-4"
    >
      {children}
    </main>
  )
}

function SlideOver({
  id,
  side,
  label,
  open,
  onClose,
  children,
}: {
  id: string
  side: 'left' | 'right'
  label: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <aside
      id={id}
      aria-label={label}
      hidden={!open}
      className={cn(
        'absolute inset-y-0 z-30 flex flex-col border-line bg-surface shadow-overlay',
        side === 'left' ? 'left-0 w-[288px] border-r' : 'right-0 w-[336px] border-l',
      )}
    >
      <div className="flex justify-end px-2 pt-2">
        <Button variant="quiet" aria-label={`Close ${label}`} onClick={onClose} className="px-2">
          <X size={20} strokeWidth={1.75} aria-hidden />
        </Button>
      </div>
      {open && children}
    </aside>
  )
}

/** Phone: the strip of jersey tiles under the top bar. Each tile jumps to that member. */
function Pager({
  board,
  members,
  page,
  onPage,
}: {
  board: Board
  members: Board['memberships']
  page: number
  onPage: (index: number) => void
}) {
  return (
    <nav
      aria-label="Members"
      className="flex shrink-0 gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-2 [scrollbar-width:none]"
    >
      {members.map((m, i) => (
        <button
          key={m.id}
          type="button"
          aria-current={i === page ? 'true' : undefined}
          aria-label={`${m.display_name}${m.id === board.me ? ' (you)' : ''}`}
          onClick={() => onPage(i)}
          className={cn(
            'shrink-0 rounded-md border-b-[3px] p-1',
            i === page ? 'border-(--tab-line)' : 'border-transparent',
          )}
        >
          <Avatar
            seat={m.seat}
            name={m.display_name}
            former={m.status === 'former'}
            photoUrl={avatarUrl(m.avatar_path)}
          />
        </button>
      ))}
    </nav>
  )
}

function PhonePane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col bg-surface">
      <h2 className="px-4 pt-4 pb-2 font-display text-name font-bold uppercase tracking-[0.02em]">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}

const phoneTabs: { value: PhoneTab; label: string; icon: typeof Columns3 }[] = [
  { value: 'board', label: 'Board', icon: Columns3 },
  { value: 'progress', label: 'Progress', icon: ChartNoAxesColumn },
  { value: 'chat', label: 'Chat', icon: MessageSquare },
  { value: 'logs', label: 'Logs', icon: ScrollText },
]

function BottomTabs({
  tab,
  onTab,
  leader,
}: {
  tab: PhoneTab
  onTab: (tab: PhoneTab) => void
  leader: boolean
}) {
  return (
    <nav
      aria-label="Board sections"
      className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {phoneTabs
        .filter((t) => leader || t.value !== 'logs')
        .map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => onTab(value)}
            className={cn(
              'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 border-t-[3px] text-label font-semibold',
              tab === value ? 'border-(--tab-line) text-ink' : 'border-transparent text-muted',
            )}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            {label}
          </button>
        ))}
    </nav>
  )
}

/** Loading shows the real layout with track-coloured bars; no spinners on the board. */
function BoardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading board" className="flex h-dvh flex-col bg-ground">
      <div className="h-14 shrink-0 bg-bar" />
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-4">
        {[408, 248, 248].map((w, i) => (
          <div
            key={i}
            className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface p-3 max-md:w-full!"
            style={{ width: w }}
          >
            <div className="h-[52px] rounded-md bg-track" />
            <div className="h-1.5 rounded-full bg-track" />
            <div className="h-4 w-2/3 rounded bg-track" />
            <div className="h-4 w-1/2 rounded bg-track" />
          </div>
        ))}
      </div>
    </div>
  )
}

function BoardProblem({ forbidden, onRetry }: { forbidden: boolean; onRetry: () => void }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-3 p-6" role="alert">
      <h1 className="font-display text-name font-bold uppercase tracking-[0.02em]">
        {forbidden ? 'Board not available' : 'Could not load the board'}
      </h1>
      <p className="text-body text-muted">
        {forbidden
          ? 'You are not a member of this group. You may have left or been removed.'
          : 'Check your connection and try again.'}
      </p>
      <div className="flex gap-3">
        {!forbidden && (
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-md border border-ink px-4 font-semibold sm:h-10"
        >
          Back to your groups
        </Link>
      </div>
    </main>
  )
}
