import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { seedBoard } from '@/features/board/seed.fixture'
import { Constants } from '@/lib/database.types'
import { LogsPane } from './LogsPane'
import { actionLabels, logSentence, type LogAction, type LogEntry } from './sentences'

const { calls, store } = vi.hoisted(() => ({
  calls: [] as { filters: Record<string, string>; range: [number, number] }[],
  store: { rows: [] as unknown[] },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const filters: Record<string, string> = {}
      let range: [number, number] = [0, 0]
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => ((filters[column] = value), chain),
        order: () => chain,
        range: (a: number, b: number) => ((range = [a, b]), chain),
        then: (resolve: (v: unknown) => void) => {
          calls.push({ filters: { ...filters }, range })
          const rows = (store.rows as LogEntry[])
            .filter((r) => !filters.actor_id || r.actor_id === filters.actor_id)
            .filter((r) => !filters.action || r.action === filters.action)
          resolve({ data: rows.slice(range[0], range[1] + 1), error: null })
        },
      }
      return chain
    },
  },
}))

const entry = (id: number, action: LogAction, extra: Partial<LogEntry> = {}): LogEntry => ({
  id,
  actor_id: 'ana',
  action,
  task_id: null,
  target_member_id: null,
  meta: {},
  created_at: new Date(Date.UTC(2026, 10, 16, 10, 0) - id * 60_000).toISOString(),
  ...extra,
})

/** One row per action type, shaped the way the write functions record it. */
const samples: Record<LogAction, LogEntry> = {
  group_created: entry(1, 'group_created', { meta: { name: 'Capstone Crew' } }),
  member_joined: entry(2, 'member_joined', { actor_id: 'ben', target_member_id: 'ben' }),
  member_left: entry(3, 'member_left', { actor_id: 'cara', target_member_id: 'cara' }),
  member_removed: entry(4, 'member_removed', { target_member_id: 'dev' }),
  leadership_transferred: entry(5, 'leadership_transferred', { target_member_id: 'ben' }),
  leadership_auto_transferred: entry(6, 'leadership_auto_transferred', {
    actor_id: null,
    target_member_id: 'cara',
  }),
  join_code_changed: entry(7, 'join_code_changed'),
  task_created: entry(8, 'task_created', {
    target_member_id: 'ben',
    meta: { number: 12, title: 'Book the room' },
  }),
  task_edited: entry(9, 'task_edited', { meta: { number: 12, fields: ['title', 'deadline'] } }),
  task_reassigned: entry(10, 'task_reassigned', {
    target_member_id: 'cara',
    meta: { number: 12, from: 'ben' },
  }),
  task_deleted: entry(11, 'task_deleted', { meta: { number: 12, title: 'Book the room' } }),
  status_changed: entry(12, 'status_changed', {
    actor_id: 'ben',
    meta: { number: 12, from: 'todo', to: 'in_progress' },
  }),
  tasks_taken_over: entry(13, 'tasks_taken_over', {
    actor_id: 'dev',
    target_member_id: 'eli',
    meta: { numbers: [6, 7] },
  }),
  question_asked: entry(14, 'question_asked', { actor_id: 'dev', meta: { number: 3 } }),
  question_replied: entry(15, 'question_replied', { meta: { number: 3 } }),
  question_resolved: entry(16, 'question_resolved', { meta: { number: 3 } }),
  question_reopened: entry(17, 'question_reopened', { meta: { number: 3 } }),
  account_deleted: entry(18, 'account_deleted', { actor_id: 'eli' }),
}

const expected: Record<LogAction, string> = {
  group_created: 'ana created the group “Capstone Crew”',
  member_joined: 'ben joined the group',
  member_left: 'cara left the group',
  member_removed: 'ana removed dev from the group',
  leadership_transferred: 'ana made ben the leader',
  leadership_auto_transferred:
    "cara became the leader because the previous leader's account was deleted",
  join_code_changed: 'ana changed the join code',
  task_created: 'ana added #12 “Book the room” for ben',
  task_edited: 'ana edited #12 (title and deadline)',
  task_reassigned: 'ana moved #12 from ben to cara',
  task_deleted: 'ana deleted #12 “Book the room”',
  status_changed: 'ben moved #12 from To do to In progress',
  tasks_taken_over: 'dev took over #6 and #7 from #eli',
  question_asked: 'dev asked a question on #3',
  question_replied: 'ana replied to the question on #3',
  question_resolved: 'ana resolved the question on #3',
  question_reopened: 'ana reopened the question on #3',
  account_deleted: '#eli deleted their account',
}

describe('log sentences', () => {
  it.each(Constants.public.Enums.log_action)('%s reads as a sentence', (action) => {
    expect(logSentence(samples[action], seedBoard)).toBe(expected[action])
    expect(actionLabels[action]).toBeTruthy()
  })

  it('covers every action type the database defines, and no others', () => {
    expect(Object.keys(samples).sort()).toEqual([...Constants.public.Enums.log_action].sort())
    expect(Object.keys(actionLabels).sort()).toEqual([...Constants.public.Enums.log_action].sort())
  })

  it('names a missing actor and an unknown member without failing', () => {
    const odd = entry(1, 'member_removed', { actor_id: null, target_member_id: 'ghost' })
    expect(logSentence(odd, seedBoard)).toBe('Taskahan removed Someone from the group')
  })
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <LogsPane board={seedBoard} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})
beforeEach(() => {
  calls.length = 0
  store.rows = Object.values(samples)
})

describe('logs pane', () => {
  it('lists every sentence, newest first, with task numbers as links', async () => {
    show()
    await screen.findAllByRole('listitem')
    const list = screen.getByRole('list', { name: 'Log entries' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(18)
    expect(items[0]).toHaveTextContent('ana created the group “Capstone Crew”')
    expect(within(list).getAllByRole('link', { name: '#12' })[0]).toHaveAttribute(
      'href',
      '/g/capstone/t/12',
    )
  })

  it('filters by member and by action on the server', async () => {
    show()
    await screen.findByRole('list', { name: 'Log entries' })
    await userEvent.click(screen.getByRole('combobox', { name: 'Action' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Task edited' }))
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Log entries' })).getAllByRole('listitem'),
      ).toHaveLength(1),
    )
    expect(calls.at(-1)!.filters).toMatchObject({ action: 'task_edited' })

    await userEvent.click(screen.getByRole('combobox', { name: 'Member' }))
    await userEvent.click(await screen.findByRole('option', { name: /#2 ben/ }))
    expect(await screen.findByText('No entries match.')).toBeVisible()
    expect(calls.at(-1)!.filters).toMatchObject({ action: 'task_edited', actor_id: 'ben' })
  })

  it('pages: Load more appears only when a full page came back', async () => {
    store.rows = Array.from({ length: 60 }, (_, i) => entry(i + 1, 'join_code_changed'))
    show()
    const more = await screen.findByRole('button', { name: 'Load more' })
    await userEvent.click(more)
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Log entries' })).getAllByRole('listitem'),
      ).toHaveLength(60),
    )
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(calls.map((c) => c.range)).toEqual([
      [0, 49],
      [50, 99],
    ])
  })

  it('says so when nothing has happened yet', async () => {
    store.rows = []
    show()
    expect(await screen.findByText('Nothing has happened yet.')).toBeVisible()
  })
})
