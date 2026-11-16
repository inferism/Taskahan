import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { seedBoard, seedBoardAsBen } from '@/features/board/seed.fixture'
import type { Board } from '@/features/board/api'
import { buildThreads, type Thread } from './api'
import { QuestionThread } from './QuestionThread'

const { rpc, tables } = vi.hoisted(() => ({
  rpc: vi.fn(),
  tables: { threads: [] as unknown[], thread_replies: [] as unknown[] },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: (table: 'threads' | 'thread_replies') => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: tables[table], error: null }),
      }
      return chain
    },
  },
}))

const open = {
  id: 'th1',
  task_id: 't3',
  opened_by: 'dev',
  body: 'Which tool for the wireframes?',
  status: 'open',
  resolved_by: null,
  resolved_at: null,
  created_at: '2026-11-16T09:00:00Z',
}
const reply = {
  id: 'r1',
  thread_id: 'th1',
  author_id: 'ana',
  body: 'Figma, please.',
  created_at: '2026-11-16T09:05:00Z',
}

function show(board: Board, taskNumber: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const task = board.tasks.find((t) => t.number === taskNumber)!
  return render(
    <QueryClientProvider client={client}>
      <QuestionThread board={board} task={task} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  tables.threads = []
  tables.thread_replies = []
})

describe('question thread', () => {
  it('nests replies under their thread, oldest first', () => {
    const built = buildThreads(
      [open as never],
      [
        { ...reply, created_at: 'b' },
        { ...reply, id: 'r0', created_at: 'a' },
      ],
    )
    expect(built[0].replies.map((r) => r.id)).toEqual(['r0', 'r1'])
  })

  it('lets the assignee ask, and sends the body to open_question', async () => {
    // ben owns task 5 (todo) in the seed.
    show(seedBoardAsBen, 5)
    await userEvent.click(await screen.findByRole('button', { name: 'Ask a question' }))
    await userEvent.type(screen.getByLabelText('Your question'), 'Is the room free?')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('open_question', {
        p_task_id: 't5',
        p_body: 'Is the room free?',
      }),
    )
  })

  it('offers no question button to the leader or to someone else', async () => {
    show(seedBoard, 5)
    await screen.findByRole('region', { name: /Questions on task #5/ })
    expect(screen.queryByRole('button', { name: 'Ask a question' })).toBeNull()
  })

  it('shows the thread with its replies and lets the leader reply and resolve', async () => {
    tables.threads = [open]
    tables.thread_replies = [reply]
    show(seedBoard, 3)
    expect(await screen.findByText('Which tool for the wireframes?')).toBeVisible()
    expect(screen.getByText('Figma, please.')).toBeVisible()
    await userEvent.type(screen.getByLabelText('Reply'), 'Thanks')
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('reply_to_question', {
        p_thread_id: 'th1',
        p_body: 'Thanks',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_question_resolved', {
        p_thread_id: 'th1',
        p_resolved: true,
      }),
    )
  })

  it('hides Mark resolved from a member who did not open the question', async () => {
    tables.threads = [open]
    show(seedBoardAsBen, 3)
    await screen.findByText('Which tool for the wireframes?')
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull()
    expect(screen.getByLabelText('Reply')).toBeVisible()
  })

  it('folds a resolved thread to one line with Reopen', async () => {
    const resolved: Thread = {
      ...(open as Omit<Thread, 'replies'>),
      status: 'resolved',
      resolved_by: 'ana',
      resolved_at: '2026-11-16T10:00:00Z',
      replies: [],
    }
    tables.threads = [resolved]
    tables.thread_replies = [reply]
    show(seedBoard, 3)
    const line = await screen.findByText(/Resolved by ana · 1 reply/)
    expect(line).toBeVisible()
    expect(screen.queryByText('Which tool for the wireframes?')).toBeNull()
    await userEvent.click(within(line.parentElement!).getByRole('button', { name: 'Reopen' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_question_resolved', {
        p_thread_id: 'th1',
        p_resolved: false,
      }),
    )
  })

  it('says so when the server refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited' } })
    show(seedBoardAsBen, 5)
    await userEvent.click(await screen.findByRole('button', { name: 'Ask a question' }))
    await userEvent.type(screen.getByLabelText('Your question'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many/)
  })
})
