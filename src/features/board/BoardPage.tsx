import { X } from 'lucide-react'
import { boardSections, type BoardSection } from './sections'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { GroupSettingsDialog } from '@/features/members/GroupSettingsDialog'
import type { MemberAction } from '@/features/members/MemberMenu'
import { RemoveMemberDialog } from '@/features/members/RemoveMemberDialog'
import { TakeOverDialog } from '@/features/members/TakeOverDialog'
import { TransferLeadershipDialog } from '@/features/members/TransferLeadershipDialog'
import { Roster } from '@/features/progress/Roster'
import { errorKey, groupsKey } from '@/features/home/api'
import { useLayout } from '@/lib/useLayout'
import { useNow } from '@/lib/useNow'
import { usePresence } from '@/features/presence/usePresence'
import { useGroupChannel } from '@/realtime/groupChannel'
import { useReconnecting } from '@/realtime/live'
import { Avatar, Button, cn } from '@/ui'
import { useAuth } from '@/app/auth'
import { WorkspaceNav } from '@/ui/WorkspaceNav'
import {
  avatarUrl,
  boardKey,
  useBoard,
  useSetTaskStatus,
  type Board,
  type Member,
  type Task,
} from './api'
import { ChatPane, Dock, LogsPane } from './Dock'
import { MemberColumn } from './MemberColumn'
import { QuestionThread } from '@/features/threads/QuestionThread'
import { TaskDialog } from './TaskDialog'
import {
  amLeader,
  canSetStatus,
  columnMembers,
  isBlocked,
  myMember,
  tasksByMember,
} from './selectors'
import { TopBar, type Panel } from './TopBar'

export function BoardPage() {
  const { groupId = '', number } = useParams()
  const board = useBoard(groupId)

  if (board.isPending) return <BoardLoading />
  // A failed refresh keeps the last board on screen; only a board never loaded is replaced.
  // Forbidden is different: the caller has lost access, so the cached board must go too.
  const forbidden = board.isError && errorKey(board.error) === 'forbidden'
  // Access ended while the board was open (the membership flipped, or the server now refuses).
  if (forbidden && board.data) return <LeaveBoard groupId={groupId} board={board.data} />
  const seat = board.data && myMember(board.data)
  if (board.data && seat?.status === 'former')
    return <LeaveBoard groupId={groupId} board={board.data} />
  if (board.isError && (!board.data || forbidden)) {
    return (
      <BoardProblem
        forbidden={forbidden}
        retrying={board.isFetching}
        onRetry={() => void board.refetch()}
      />
    )
  }
  return (
    <BoardShell
      key={groupId}
      board={board.data!}
      linkedNumber={number}
      refreshFailed={board.isError}
      retrying={board.isFetching}
      onRetry={() => void board.refetch()}
    />
  )
}

/** What to tell a member whose access ended, by how it ended. */
function lostAccess(name: string, reason: Member['left_reason'] | undefined): string {
  if (reason === 'removed') return `You were removed from ${name}.`
  if (reason === 'left') return `You left ${name}.`
  return `You no longer have access to ${name}.`
}

/**
 * Leaves a board that is no longer the caller's: drops its caches (the unmount closes the
 * channel) and goes Home with a notice. When the cache has not yet seen why access ended (the
 * snapshot was refused before the membership change arrived), the caller's own membership row,
 * which stays readable to them, says whether they left or were removed.
 */
function LeaveBoard({ groupId, board }: { groupId: string; board: Board }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const name = board.group.name
  const seatId = board.me
  const known = myMember(board)?.left_reason
  useEffect(() => {
    let live = true
    const why = async (): Promise<Member['left_reason'] | undefined> => {
      if (known) return known
      try {
        const { data } = await supabase
          .from('memberships')
          .select('left_reason')
          .eq('id', seatId)
          .maybeSingle()
        return data?.left_reason ?? undefined
      } catch {
        return undefined
      }
    }
    void why().then((reason) => {
      if (!live) return
      queryClient.removeQueries({ queryKey: boardKey(groupId) })
      void queryClient.invalidateQueries({ queryKey: groupsKey })
      navigate('/', { replace: true, state: { notice: lostAccess(name, reason) } })
    })
    return () => {
      live = false
    }
  }, [queryClient, navigate, groupId, name, seatId, known])
  return <BoardLoading />
}

function BoardShell({
  board,
  linkedNumber,
  refreshFailed,
  retrying,
  onRetry,
}: {
  board: Board
  linkedNumber?: string
  refreshFailed: boolean
  retrying: boolean
  onRetry: () => void
}) {
  useGroupChannel(board.group.id, board.me)
  const online = usePresence(board)
  const reconnecting = useReconnecting(board.group.id)
  const layout = useLayout()
  const members = useMemo(() => columnMembers(board), [board])
  const byMember = useMemo(() => tasksByMember(board), [board])
  const me = myMember(board)
  const leader = amLeader(board)
  const now = useNow()

  const [expanded, setExpanded] = useState(board.me)
  // One open task per column, by member id.
  const [openTasks, setOpenTasks] = useState<Record<string, string | undefined>>({})
  const setStatus = useSetTaskStatus(board.group.id)
  // `null` is closed; `'new'` adds; a task edits.
  const [editor, setEditor] = useState<Task | 'new' | null>(null)
  // Member management: which seat an action is open for, and the settings dialog.
  const [managing, setManaging] = useState<{ action: MemberAction; member: Member } | null>(null)
  const [takingOver, setTakingOver] = useState<Member | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const activeMembers = useMemo(() => members.filter((m) => m.status === 'active'), [members])
  const location = useLocation()
  const { session } = useAuth()
  const userId = session?.user.id
  useEffect(() => {
    if (userId) sessionStorage.setItem(`taskahan.group.${userId}`, board.group.id)
  }, [userId, board.group.id])
  const section = new URLSearchParams(location.search).get('section')
  const initialTab =
    boardSections.find((t) => t.value === section && (leader || section !== 'logs'))?.value ??
    'board'
  const [chosenPanel, setPanel] = useState<Panel | null>(
    initialTab === 'progress'
      ? 'progress'
      : initialTab === 'chat' || initialTab === 'logs'
        ? 'chat'
        : null,
  )
  // Panels only exist on tablets.
  const panel = layout === 'tablet' ? chosenPanel : null
  const [tab, setTab] = useState<BoardSection>(initialTab)
  const [page, setPage] = useState(0)

  // Deep link `/g/:groupId/t/:number`: open that task once per navigation to it.
  const linked = linkedNumber
    ? board.tasks.find((t) => t.number === Number(linkedNumber))
    : undefined
  // Each navigation has its own key, so following the same #2 again reopens it. A link counts as
  // handled only once its task is found: a task that a later snapshot brings still opens.
  const linkKey = linkedNumber ? location.key : undefined
  const [handledLink, setHandledLink] = useState<string>()
  if (linked && linkKey !== handledLink) {
    setHandledLink(linkKey)
    setExpanded(linked.assignee_id)
    setOpenTasks((cur) => ({ ...cur, [linked.assignee_id]: linked.id }))
    setTab('board')
  }
  const missingLink = linkedNumber && !linked ? linkedNumber : undefined

  const columnRefs = useRef(new Map<string, HTMLElement>())
  const scrollTarget = useRef<number | null>(null)
  const pagerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  // The pager is rebuilt each time the Board tab returns; put it back on the member it showed.
  useLayoutEffect(() => {
    const pager = pagerRef.current
    if (layout !== 'phone' || tab !== 'board' || !pager) return
    pager.scrollTo?.({ left: page * pager.clientWidth, behavior: 'auto' })
    // Only a remount restores; page changes from swiping must not scroll again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, tab])

  const goToPage = useCallback(
    (index: number, smooth = true) => {
      const pager = pagerRef.current
      if (!pager) return
      scrollTarget.current = index
      pager.scrollTo({
        left: index * pager.clientWidth,
        behavior:
          smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'smooth'
            : 'auto',
      })
      setPage(index)
    },
    [setPage],
  )

  const linkedId = linked?.id
  const linkedAssignee = linked?.assignee_id
  useEffect(() => {
    if (!linkedId || !linkedAssignee) return
    const frame = requestAnimationFrame(() => {
      if (layout === 'phone')
        goToPage(
          members.findIndex((m) => m.id === linkedAssignee),
          false,
        )
      document
        .querySelector(`[data-task="${linkedId}"]`)
        ?.scrollIntoView?.({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
    // Only a new link scrolls; later layout or member changes must not yank the board around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedId, linkKey])

  /** Roster row: show that member's column, expanded. */
  const showMember = useCallback(
    (memberId: string) => {
      setTab('board')
      if (layout === 'phone') {
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
    [layout, members, goToPage, setTab, setPanel, setExpanded],
  )

  const toggleTask = useCallback(
    (task: Task) => {
      setExpanded(task.assignee_id)
      setOpenTasks((cur) => ({
        ...cur,
        [task.assignee_id]: cur[task.assignee_id] === task.id ? undefined : task.id,
      }))
    },
    [setExpanded, setOpenTasks],
  )

  const roster = (
    <Roster
      members={members}
      tasksByMember={byMember}
      me={board.me}
      online={online}
      onSelect={showMember}
    />
  )

  const columns = members.map((m, i) => (
    <MemberColumn
      key={m.id}
      index={i}
      ref={(el) => {
        if (el) columnRefs.current.set(m.id, el)
        else columnRefs.current.delete(m.id)
      }}
      member={m}
      tasks={byMember.get(m.id) ?? []}
      isMe={m.id === board.me}
      online={online.has(m.id)}
      leader={leader}
      expanded={layout === 'phone' || expanded === m.id}
      fullWidth={layout === 'phone'}
      now={now}
      onExpand={() => setExpanded(m.id)}
      openTaskId={openTasks[m.id]}
      onToggleTask={toggleTask}
      canSetStatus={(t) => canSetStatus(board, t)}
      onStatus={(t, status) => !setStatus.isPending && setStatus.mutate({ taskId: t.id, status })}
      statusSaving={setStatus.isPending}
      onEdit={leader ? setEditor : undefined}
      renderThread={(t) => <QuestionThread board={board} task={t} />}
      failedTaskId={setStatus.isError ? setStatus.variables.taskId : undefined}
      onRetryStatus={() => setStatus.variables && setStatus.mutate(setStatus.variables)}
      onManage={
        leader && m.status === 'active' && m.id !== board.me
          ? (action) => setManaging({ action, member: m })
          : undefined
      }
      onTakeOver={m.status === 'former' ? () => setTakingOver(m) : undefined}
    />
  ))

  return (
    <div className="flex h-dvh overflow-hidden bg-ground">
      {layout === 'desktop' && (
        <WorkspaceNav>
          <div className="mt-5 border-t border-line pt-5">
            {boardSections
              .filter((t) => leader || t.value !== 'logs')
              .map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className="workspace-link w-full"
                  aria-current={tab === value ? 'page' : undefined}
                  onClick={() => setTab(value)}
                >
                  <Icon size={18} aria-hidden />
                  {label}
                </button>
              ))}
          </div>
        </WorkspaceNav>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          board={board}
          me={me}
          layout={layout}
          panel={panel}
          onPanel={setPanel}
          onlineCount={online.size}
          onAddTask={leader ? () => setEditor('new') : undefined}
          onSettings={leader ? () => setSettingsOpen(true) : undefined}
        />
        {reconnecting && (
          <p
            role="status"
            className="shrink-0 border-b border-line bg-sunken px-4 py-1 text-body text-muted"
          >
            Reconnecting…
          </p>
        )}
        {refreshFailed && (
          <p
            role="alert"
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-sunken px-4 py-1 text-body text-blocked"
          >
            Could not refresh the board. You are seeing the last version that loaded.
            <Button variant="quiet" busy={retrying} busyLabel="Retrying…" onClick={onRetry}>
              Retry
            </Button>
          </p>
        )}
        {missingLink && (
          <p role="status" className="shrink-0 border-b border-line bg-sunken px-4 py-2 text-body">
            Task #{missingLink} is not on this board. It may have been deleted.{' '}
            <Link to={`/g/${board.group.id}`} className="font-semibold text-link underline">
              Dismiss
            </Link>
          </p>
        )}

        {layout === 'desktop' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
            <div className="py-6">
              <h1 className="text-[30px] font-medium tracking-tight">
                {tab === 'board'
                  ? board.group.name
                  : boardSections.find((t) => t.value === tab)?.label}
              </h1>
              <p className="mt-1 text-body text-muted">
                {tab === 'board' ? 'Everyone’s part, in one place.' : board.group.name}
              </p>
            </div>
            {tab === 'board' ? (
              <>
                {board.tasks.some(isBlocked) && (
                  <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-5 py-3">
                    <p className="text-body">
                      <span className="font-medium text-blocked">A task needs a hand.</span> An open
                      question is waiting for an answer.
                    </p>
                    <Button
                      onClick={() => {
                        const task = board.tasks.find(isBlocked)!
                        showMember(task.assignee_id)
                        setOpenTasks((cur) => ({ ...cur, [task.assignee_id]: task.id }))
                      }}
                    >
                      View question
                    </Button>
                  </div>
                )}
                <div className="flex min-h-[360px] flex-1">
                  <BoardArea>{columns}</BoardArea>
                </div>
                <div className="mt-5 grid h-72 shrink-0 grid-cols-2 gap-5">
                  <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
                    {roster}
                  </aside>
                  <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
                    <Dock board={board} />
                  </aside>
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-surface">
                {tab === 'progress' && roster}
                {tab === 'chat' && <ChatPane board={board} />}
                {tab === 'logs' && leader && <LogsPane board={board} />}
              </div>
            )}
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
              <Dock board={board} defaultTab={initialTab === 'logs' ? 'logs' : 'chat'} />
            </SlideOver>
          </div>
        )}

        {layout === 'phone' && (
          <>
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {tab === 'board' && (
                <>
                  <Pager board={board} members={members} page={page} onPage={(i) => goToPage(i)} />
                  <div
                    ref={pagerRef}
                    onPointerDown={() => {
                      scrollTarget.current = null
                    }}
                    onWheel={() => {
                      scrollTarget.current = null
                    }}
                    onScroll={(e) => {
                      const el = e.currentTarget
                      if (!el.clientWidth) return
                      const index = Math.round(el.scrollLeft / el.clientWidth)
                      if (scrollTarget.current !== null && scrollTarget.current !== index) return
                      scrollTarget.current = null
                      setPage(index)
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
                  <ChatPane board={board} />
                </PhonePane>
              )}
              {tab === 'logs' && leader && (
                <PhonePane title="Logs">
                  <LogsPane board={board} />
                </PhonePane>
              )}
            </main>
            {leader && tab === 'board' && (
              <div className="shrink-0 border-t border-line bg-surface p-3">
                <Button variant="primary" className="w-full" onClick={() => setEditor('new')}>
                  Add task
                </Button>
              </div>
            )}
            <BottomTabs tab={tab} onTab={setTab} leader={leader} />
          </>
        )}
        <TaskDialog
          open={editor !== null}
          onOpenChange={(open) => !open && setEditor(null)}
          groupId={board.group.id}
          members={activeMembers}
          me={board.me}
          task={editor && editor !== 'new' ? editor : undefined}
        />
        <RemoveMemberDialog
          groupId={board.group.id}
          member={managing?.action === 'remove' ? managing.member : null}
          onOpenChange={(open) => !open && setManaging(null)}
        />
        <TransferLeadershipDialog
          groupId={board.group.id}
          member={managing?.action === 'transfer' ? managing.member : null}
          onOpenChange={(open) => !open && setManaging(null)}
        />
        <TakeOverDialog
          groupId={board.group.id}
          me={board.me}
          from={takingOver}
          tasks={takingOver ? (byMember.get(takingOver.id) ?? []) : []}
          onOpenChange={(open) => !open && setTakingOver(null)}
        />
        <GroupSettingsDialog
          open={settingsOpen && leader}
          onOpenChange={setSettingsOpen}
          group={board.group}
          activeCount={activeMembers.length}
        />
      </div>
    </div>
  )
}

/** The centre pane: columns side by side, scrolling sideways when they overflow. */
function BoardArea({ children }: { children: ReactNode }) {
  return (
    <main
      aria-label="Board"
      className="flex min-h-0 min-w-0 flex-1 items-start gap-4 overflow-x-auto p-4 xl:p-0"
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

/** Phone: the strip of named avatars under the top bar. Each tile jumps to that member. */
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
  const strip = useRef<HTMLElement>(null)
  const line = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const nav = strip.current
    const active = nav?.querySelector<HTMLElement>('[aria-current=true]')
    if (!nav || !active) return
    function align() {
      if (!line.current || !active) return
      line.current.style.transform = `translateX(${active.offsetLeft}px)`
      line.current.style.width = `${active.offsetWidth}px`
    }
    align()
    active.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'instant' })
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(align)
    observer.observe(nav)
    observer.observe(active)
    return () => observer.disconnect()
  }, [page, members])
  return (
    <nav
      ref={strip}
      aria-label="Members"
      className="relative flex shrink-0 gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-2 [scrollbar-width:none]"
    >
      {members.map((m, i) => (
        <button
          key={m.id}
          type="button"
          aria-current={i === page ? 'true' : undefined}
          aria-label={`${m.display_name}${m.id === board.me ? ' (you)' : ''}`}
          onClick={() => onPage(i)}
          className="flex shrink-0 items-center gap-2 rounded-md p-2 text-body"
        >
          <Avatar
            seat={m.seat}
            name={m.display_name}
            former={m.status === 'former'}
            photoUrl={avatarUrl(m.avatar_path)}
          />
          <span>{m.display_name}</span>
        </button>
      ))}
      <span
        ref={line}
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-0 h-0.5 rounded-full bg-ink motion-safe:transition-[transform,width] motion-safe:duration-200"
      />
    </nav>
  )
}

function PhonePane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col bg-surface">
      <h2 className="px-4 pt-4 pb-2 text-name font-medium tracking-tight">{title}</h2>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function BottomTabs({
  tab,
  onTab,
  leader,
}: {
  tab: BoardSection
  onTab: (tab: BoardSection) => void
  leader: boolean
}) {
  return (
    <nav
      aria-label="Board sections"
      className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {boardSections
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
  const layout = useLayout()
  const bar = (cls: string) => <div className={cn('rounded bg-track', cls)} />
  return (
    <div aria-busy="true" aria-label="Loading board" className="flex h-dvh flex-col bg-ground">
      <div className="h-14 shrink-0 bg-bar" />
      <div className="flex min-h-0 flex-1">
        {layout === 'desktop' && (
          <div className="flex w-[288px] shrink-0 flex-col gap-4 border-r border-line bg-surface p-4">
            {bar('h-5 w-1/2')}
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-9 shrink-0 rounded-md bg-track" />
                <div className="flex flex-1 flex-col gap-2">
                  {bar('h-1.5 rounded-full')}
                  {bar('h-3 w-2/3')}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-1 gap-3 overflow-hidden p-4">
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
        {layout === 'desktop' && (
          <div className="flex w-[336px] shrink-0 flex-col gap-3 border-l border-line bg-surface p-4">
            {bar('h-5 w-1/3')}
            {bar('h-4 w-3/4')}
            {bar('h-4 w-1/2')}
            {bar('h-4 w-2/3')}
          </div>
        )}
      </div>
    </div>
  )
}

function BoardProblem({
  forbidden,
  retrying,
  onRetry,
}: {
  forbidden: boolean
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-3 p-6" role="alert">
      <h1 className="text-name font-medium tracking-tight">
        {forbidden ? 'Board not available' : 'Could not load the board'}
      </h1>
      <p className="text-body text-muted">
        {forbidden
          ? 'You are not a member of this group. You may have left or been removed.'
          : 'Check your connection and try again.'}
      </p>
      <div className="flex gap-3">
        {!forbidden && (
          <Button variant="primary" busy={retrying} busyLabel="Retrying…" onClick={onRetry}>
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
