import { render } from '@testing-library/react'
import { ActivityHeartbeat, HEARTBEAT_MS } from './ActivityHeartbeat'

const { rpc, session } = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: { current: { user: { id: 'u1' } } as { user: { id: string } } | null },
}))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('./auth', () => ({ useAuth: () => ({ session: session.current, loading: false }) }))

beforeEach(() => {
  vi.useFakeTimers()
  rpc.mockReset().mockResolvedValue({ error: null })
  session.current = { user: { id: 'u1' } }
})
afterEach(() => vi.useRealTimers())

describe('activity heartbeat', () => {
  it('calls touch_activity on load, then once per hour', () => {
    render(<ActivityHeartbeat />)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('touch_activity')
    vi.advanceTimersByTime(HEARTBEAT_MS - 1)
    expect(rpc).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('does nothing when signed out', () => {
    session.current = null
    render(<ActivityHeartbeat />)
    expect(rpc).not.toHaveBeenCalled()
  })
})
