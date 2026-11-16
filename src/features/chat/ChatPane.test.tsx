import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { seedBoard } from '@/features/board/seed.fixture'
import { messagesKey } from '@/realtime/groupChannel'
import { ChatPane } from './ChatPane'
import { PAGE_SIZE, mergeMessages, type Message } from './api'

const { rpc, store } = vi.hoisted(() => ({ rpc: vi.fn(), store: { rows: [] as unknown[] } }))

type Row = { id: string; author_id: string; body: string; created_at: string }

/** A tiny stand-in for PostgREST: ordering, the `lt` cursor and the page window. */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => {
      let cursor: { created_at: string; id: string } | undefined
      let from = 0
      let size = Infinity
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        or: (filter: string) => {
          const m = /created_at\.lt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.lt\.([^)]+)\)/.exec(
            filter,
          )!
          cursor = { created_at: m[1], id: m[2] }
          return chain
        },
        limit: (n: number) => ((size = n), chain),
        range: (a: number, b: number) => ((from = a), (size = b - a + 1), chain),
        then: (resolve: (v: unknown) => void) => {
          let rows = [...(store.rows as Row[])].sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
          )
          if (cursor)
            rows = rows.filter(
              (r) =>
                r.created_at < cursor!.created_at ||
                (r.created_at === cursor!.created_at && r.id < cursor!.id),
            )
          resolve({ data: rows.slice(from, from + size), error: null })
        },
      }
      return chain
    },
  },
}))

/** Message n (1-based) is one minute after message n-1, written by ben on odd n, cara on even. */
const make = (n: number): Row => ({
  id: `m${String(n).padStart(3, '0')}`,
  author_id: n % 2 ? 'ben' : 'cara',
  body: `message ${n}`,
  created_at: new Date(Date.UTC(2026, 10, 10, 8, 0) + n * 60_000).toISOString(),
})

function show(board = seedBoard) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ChatPane board={board} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return client
}

const shown = () => screen.queryAllByText(/^message \d+$/).map((el) => el.textContent)

beforeEach(() => {
  store.rows = Array.from({ length: 200 }, (_, i) => make(i + 1))
  window.HTMLElement.prototype.scrollTo = () => {}
})

describe('chat panel', () => {
  it('opens on the newest page and pages 200 seeded messages back without gaps or repeats', async () => {
    show()
    await screen.findByText('message 200')
    expect(shown()).toHaveLength(PAGE_SIZE)
    expect(shown()[0]).toBe('message 151')

    for (const expected of [100, 50, 0]) {
      const more = screen.queryByRole('button', { name: 'Load older messages' })
      if (!more) break
      await userEvent.click(more)
      await waitFor(() => expect(shown()).toHaveLength(200 - expected))
    }
    expect(shown()).toEqual(Array.from({ length: 200 }, (_, i) => `message ${i + 1}`))
    // The oldest page was full-sized, so one more ask is what finds the start of the chat.
    await userEvent.click(screen.getByRole('button', { name: 'Load older messages' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull(),
    )
    expect(shown()).toHaveLength(200)
  })

  it('stops offering older messages once the whole chat fits one page', async () => {
    store.rows = [make(1), make(2)]
    show()
    await screen.findByText('message 2')
    expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull()
  })

  it('labels a former member and turns #refs into task links', async () => {
    store.rows = [{ ...make(1), author_id: 'eli', body: 'see #3 please' }]
    show()
    await screen.findByText('see', { exact: false })
    const log = screen.getByRole('log', { name: 'Chat messages' })
    expect(within(log).getByText('#eli · Former member')).toBeVisible()
    expect(within(log).getByRole('link', { name: '#3' })).toHaveAttribute('href', '/g/capstone/t/3')
  })

  it('shows a sent message at once and writes it through send_message', async () => {
    store.rows = [make(1)]
    rpc.mockResolvedValue({ data: { ...make(2), author_id: 'ana', body: 'hi all' }, error: null })
    const client = show()
    await screen.findByText('message 1')
    await userEvent.type(screen.getByLabelText('Message'), 'hi all{Enter}')
    expect(await screen.findByText('hi all')).toBeVisible()
    expect(rpc).toHaveBeenCalledWith('send_message', { p_group_id: 'capstone', p_body: 'hi all' })
    await waitFor(() =>
      expect(client.getQueryData<Message[]>(messagesKey('capstone'))!.map((m) => m.id)).toEqual([
        'm001',
        'm002',
      ]),
    )
  })

  it('keeps a typed line break with Shift+Enter and refuses an empty message', async () => {
    rpc.mockClear()
    show()
    await screen.findByText('message 200')
    const box = screen.getByLabelText('Message')
    await userEvent.type(box, '   {Enter}')
    expect(rpc).not.toHaveBeenCalled()
    await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b')
    expect(box).toHaveValue('   a\nb')
  })

  it('offers a New message button instead of jumping when the reader has scrolled up', async () => {
    const client = show()
    await screen.findByText('message 200')
    const log = screen.getByRole('log', { name: 'Chat messages' })
    // jsdom has no layout: pretend the reader is far above the end.
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 5000 })
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 400 })
    log.scrollTop = 1000
    act(() => void log.dispatchEvent(new Event('scroll')))
    act(() => {
      client.setQueryData<Message[]>(messagesKey('capstone'), (cur) => [
        ...(cur ?? []),
        { ...make(201), author_id: 'cara' },
      ])
    })
    expect(await screen.findByRole('button', { name: 'New message' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'New message' }))
    expect(screen.queryByRole('button', { name: 'New message' })).toBeNull()
  })
})

describe('mergeMessages', () => {
  it('orders by time then id and keeps one row per id', () => {
    const a = make(1)
    const b = make(2)
    expect(mergeMessages([b, a], [a]).map((m) => m.id)).toEqual(['m001', 'm002'])
  })
})
