import { QueryClient } from '@tanstack/react-query'
import { boardKey, type Board } from '@/features/board/api'
import { seedBoard } from '@/features/board/seed.fixture'
import { applyGroupRow, applyMemberRow, applyTaskRow } from './changes'

const { channels, removeChannel } = vi.hoisted(() => ({
  channels: [] as {
    topic: string
    opts: unknown
    bindings: { type: string; filter: Record<string, string>; cb: (p: unknown) => void }[]
  }[],
  removeChannel: vi.fn(async () => 'ok'),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (topic: string, opts: unknown) => {
      const entry = {
        topic,
        opts,
        bindings: [] as (typeof channels)[number]['bindings'],
      }
      const ch = {
        on: (type: string, filter: Record<string, string>, cb: (p: unknown) => void) => {
          entry.bindings.push({ type, filter, cb })
          return ch
        },
        subscribe: () => ch,
      }
      channels.push(entry)
      return ch
    },
    removeChannel,
  },
}))

const { acquireGroupChannel } = await import('./groupChannel')

/** A task row as the table stores it: extra columns the cache does not keep. */
const taskRow = (over: Record<string, unknown>) => ({
  ...seedBoard.tasks[1],
  group_id: 'capstone',
  deleted_at: null,
  ...over,
})

describe('change rows to board patches', () => {
  it('replaces a task and keeps only the snapshot fields', () => {
    const next = applyTaskRow(
      seedBoard,
      taskRow({ status: 'done', updated_at: '2026-11-17T00:00:00Z' }),
    )
    const t2 = next.tasks.find((t) => t.id === 't2')!
    expect(t2.status).toBe('done')
    expect(t2).not.toHaveProperty('group_id')
    expect(t2).not.toHaveProperty('deleted_at')
  })

  it('adds a new task in number order', () => {
    const next = applyTaskRow(seedBoard, taskRow({ id: 't8', number: 8, title: 'New' }))
    expect(next.tasks.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('drops a soft-deleted task', () => {
    const next = applyTaskRow(
      seedBoard,
      taskRow({ deleted_at: '2026-11-17T00:00:00Z', updated_at: '2026-11-17T00:00:00Z' }),
    )
    expect(next.tasks.some((t) => t.id === 't2')).toBe(false)
  })

  it('ignores an event older than the cached row', () => {
    const next = applyTaskRow(
      seedBoard,
      taskRow({ status: 'todo', updated_at: '2020-01-01T00:00:00Z' }),
    )
    expect(next).toBe(seedBoard)
  })

  it('flips a member to former and clears the avatar', () => {
    const board: Board = {
      ...seedBoard,
      memberships: seedBoard.memberships.map((m) =>
        m.id === 'cara' ? { ...m, avatar_path: 'c.png' } : m,
      ),
    }
    const row = {
      ...board.memberships[2],
      group_id: 'capstone',
      status: 'former',
      left_reason: 'removed',
    }
    const cara = applyMemberRow(board, row).memberships.find((m) => m.id === 'cara')!
    expect(cara.status).toBe('former')
    expect(cara.avatar_path).toBeNull()
  })

  it('keeps an active member avatar across a role change', () => {
    const board: Board = {
      ...seedBoard,
      memberships: seedBoard.memberships.map((m) =>
        m.id === 'ben' ? { ...m, avatar_path: 'b.png' } : m,
      ),
    }
    const row = { ...board.memberships[1], group_id: 'capstone', role: 'leader' }
    const ben = applyMemberRow(board, row).memberships.find((m) => m.id === 'ben')!
    expect(ben).toMatchObject({ role: 'leader', avatar_path: 'b.png' })
  })

  it('updates the group but never leaks internal counters', () => {
    const row = { ...seedBoard.group, name: 'Renamed', next_task_number: 9, next_seat: 6 }
    const next = applyGroupRow(seedBoard, row)
    expect(next.group.name).toBe('Renamed')
    expect(next.group).not.toHaveProperty('next_task_number')
  })
})

// Fake timers would otherwise run the cache's garbage collection.
const newClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })

describe('group channel manager', () => {
  beforeEach(() => {
    channels.length = 0
    removeChannel.mockClear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  const flush = async () => {
    await vi.runAllTimersAsync()
  }

  it('joins a private group channel and filters every table by group', async () => {
    const qc = newClient()
    const release = acquireGroupChannel(qc, 'capstone')
    await flush()
    expect(channels).toHaveLength(1)
    expect(channels[0].topic).toBe('group:capstone')
    expect(channels[0].opts).toEqual({ config: { private: true } })
    const changes = channels[0].bindings.filter((b) => b.type === 'postgres_changes')
    expect(changes.map((b) => `${b.filter.table} ${b.filter.filter}`)).toEqual([
      'tasks group_id=eq.capstone',
      'memberships group_id=eq.capstone',
      'threads group_id=eq.capstone',
      'thread_replies group_id=eq.capstone',
      'messages group_id=eq.capstone',
      'groups id=eq.capstone',
    ])
    release()
    await flush()
  })

  it('patches the cache on a change and refetches each time the change stream starts', async () => {
    const qc = newClient()
    qc.setQueryData(boardKey('capstone'), seedBoard)
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const release = acquireGroupChannel(qc, 'capstone')
    await flush()
    const ch = channels[0]

    ch.bindings[0].cb({
      eventType: 'UPDATE',
      new: taskRow({ status: 'done', updated_at: '2026-11-17T00:00:00Z' }),
    })
    expect(qc.getQueryData<Board>(boardKey('capstone'))!.tasks[1].status).toBe('done')

    const system = ch.bindings.find((b) => b.type === 'system')!.cb
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    system({ extension: 'postgres_changes', status: 'ok' })
    system({ extension: 'postgres_changes', status: 'error', message: 'down' })
    system({ extension: 'presence', status: 'ok' })
    system({ extension: 'postgres_changes', status: 'ok' }) // back after a disconnect
    expect(warn).toHaveBeenCalledOnce()
    const boardRefetches = invalidate.mock.calls.filter(
      ([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(boardKey('capstone')),
    )
    expect(boardRefetches).toHaveLength(2)
    release()
    await flush()
  })

  it('shares one channel between users and leaves when the last one goes', async () => {
    const qc = newClient()
    const a = acquireGroupChannel(qc, 'capstone')
    a()
    const b = acquireGroupChannel(qc, 'capstone') // a remount in the same tick
    await flush()
    expect(channels).toHaveLength(1)
    expect(removeChannel).not.toHaveBeenCalled()
    b()
    await flush()
    expect(removeChannel).toHaveBeenCalledTimes(1)
  })
})
