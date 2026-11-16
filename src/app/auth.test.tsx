import { act, render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { createQueryClient } from '@/lib/queryClient'
import { AuthProvider } from './auth'

const { getSession, listeners } = vi.hoisted(() => ({
  getSession: vi.fn(),
  listeners: [] as ((event: string, session: unknown) => void)[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        listeners.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  },
}))

const session = (id: string) => ({ user: { id } }) as unknown as Session

async function setup() {
  const client = createQueryClient()
  getSession.mockResolvedValue({ data: { session: session('ana') } })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <span />
      </AuthProvider>
    </QueryClientProvider>,
  )
  await act(async () => {})
  client.setQueryData(['board', 'g1'], { group: { join_code: 'SECRETXX' } })
  const emit = (s: Session | null) => act(() => listeners.at(-1)!('EVENT', s))
  return { client, emit }
}

describe('auth provider caches', () => {
  beforeEach(() => (listeners.length = 0))

  it('keeps the cache when the same account refreshes its session', async () => {
    const { client, emit } = await setup()
    emit(session('ana'))
    expect(client.getQueryData(['board', 'g1'])).toBeDefined()
  })

  it('drops every cached board when the account signs out', async () => {
    const { client, emit } = await setup()
    emit(null)
    expect(client.getQueryData(['board', 'g1'])).toBeUndefined()
  })

  it('drops every cached board when a different account signs in', async () => {
    const { client, emit } = await setup()
    emit(session('ben'))
    expect(client.getQueryData(['board', 'g1'])).toBeUndefined()
  })
})
