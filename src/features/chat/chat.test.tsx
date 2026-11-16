import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { messagesKey } from '@/realtime/groupChannel'
import { confirmMessage, isPending, newPending, useSendMessage, type Message } from './api'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const old: Message = { id: 'm1', author_id: 'a', body: 'hi', created_at: '2026-11-16T10:00:00Z' }

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  client.setQueryData<Message[]>(messagesKey('g'), [old])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useSendMessage('g', 'me'), { wrapper })
  return { client, ...hook }
}

describe('optimistic chat send', () => {
  it('shows the message at once, then swaps in the server row', async () => {
    let answer: (v: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { client, result } = setup()
    const pending = newPending()
    act(() => result.current.mutate({ body: 'yo', pending }))
    await waitFor(() => expect(client.getQueryData<Message[]>(messagesKey('g'))).toHaveLength(2))
    expect(isPending(client.getQueryData<Message[]>(messagesKey('g'))![1])).toBe(true)
    const real = { id: 'm2', author_id: 'me', body: 'yo', created_at: '2026-11-16T10:01:00Z' }
    answer({ data: real, error: null })
    await waitFor(() =>
      expect(client.getQueryData<Message[]>(messagesKey('g'))!.map((m) => m.id)).toEqual([
        'm1',
        'm2',
      ]),
    )
  })

  it('takes the message back out when the write is rejected', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    const { client, result } = setup()
    act(() => result.current.mutate({ body: 'nope', pending: newPending() }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData<Message[]>(messagesKey('g'))).toEqual([old])
  })

  it('never lists a message twice when the change event beat the answer', () => {
    const real = { id: 'm2', author_id: 'me', body: 'yo', created_at: '2026-11-16T10:01:00Z' }
    const list = confirmMessage([old, real, { ...real, id: 'pending-9' }], 'pending-9', real)
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2'])
  })
})
