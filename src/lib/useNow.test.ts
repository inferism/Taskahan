import { act, renderHook } from '@testing-library/react'
import { useNow } from './useNow'

describe('useNow', () => {
  afterEach(() => vi.useRealTimers())

  it('moves on every minute and when the window regains focus', () => {
    vi.useFakeTimers({ now: new Date('2026-11-16T10:00:00Z') })
    const { result } = renderHook(() => useNow())
    expect(result.current.toISOString()).toBe('2026-11-16T10:00:00.000Z')

    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.toISOString()).toBe('2026-11-16T10:01:00.000Z')

    vi.setSystemTime(new Date('2026-11-16T13:00:00Z'))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current.toISOString()).toBe('2026-11-16T13:00:00.000Z')
  })
})
