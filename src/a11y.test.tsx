/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { clearOnline } from '@/realtime/presence'
import { ToastProvider } from '@/ui'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { BoardPage } from '@/features/board/BoardPage'
import { seedBoard } from '@/features/board/seed.fixture'
import { SettingsPage } from '@/features/profile/SettingsPage'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        range: () => chain,
        limit: () => chain,
        single: () => chain,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: { username: 'ana', avatar_path: null, theme: 'light' }, error: null }),
      }
      return chain
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    auth: { signOut: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn() },
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch }
      return ch
    },
    removeChannel: vi.fn(async () => 'ok'),
  },
}))
vi.mock('@/app/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u-ana' } } }) }))

// jsdom has no layout or computed cascade, so contrast is checked from the tokens below.
async function serious(container: Element) {
  const { violations } = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
}

const wrap = (ui: React.ReactNode, path = '/') => (
  <QueryClientProvider client={createQueryClient()}>
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>
)

describe('axe: no serious or critical issues', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    rpc.mockResolvedValue({ data: seedBoard, error: null })
    clearOnline('capstone')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('login', async () => {
    const { container } = render(wrap(<LoginPage />))
    expect(await serious(container)).toEqual([])
  })
  it('signup', async () => {
    const { container } = render(wrap(<SignupPage />))
    expect(await serious(container)).toEqual([])
  })
  it('board', async () => {
    const { container } = render(
      wrap(
        <Routes>
          <Route path="/g/:groupId" element={<BoardPage />} />
        </Routes>,
        '/g/capstone',
      ),
    )
    await screen.findByRole('region', { name: 'Task Progress' })
    expect(await serious(container)).toEqual([])
  })
  it('settings', async () => {
    const { container } = render(wrap(<SettingsPage />))
    await screen.findByText(/ana/)
    expect(await serious(container)).toEqual([])
  })
})

// WCAG 2.x contrast of the text and focus pairs in tokens.css, in both themes.
const css = readFileSync('src/styles/tokens.css', 'utf8')
function tokens(selector: RegExp) {
  const block = selector.exec(css)![1]
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  )
}
const light = tokens(/:root\s*\{([^}]*)\}/)
const dark = { ...light, ...tokens(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/) }
function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe.each([
  ['light', light],
  ['dark', dark],
])('contrast, %s theme', (_name, t) => {
  const text: [string, string][] = [
    ['ink', 'ground'],
    ['ink', 'surface'],
    ['ink', 'surface-sunken'],
    ['muted', 'ground'],
    ['muted', 'surface'],
    ['muted', 'surface-sunken'],
    ['link', 'surface'],
    ['link', 'ground'],
    ['done-text', 'surface'],
    ['blocked', 'surface'],
    ['on-yellow', 'scoreboard-yellow'],
    ['on-yellow', 'scoreboard-yellow-hover'],
    // The destructive button's hover label and the blocked glyph's question mark.
    ['on-status', 'blocked'],
  ]
  it.each(text)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
  })
  it('the done check on its fill is at least 3:1', () => {
    expect(ratio(t['on-status'], t.done)).toBeGreaterThanOrEqual(3)
  })
  it.each(['ground', 'surface'])('focus ring on %s is at least 3:1', (bg) => {
    expect(ratio(t.focus, t[bg])).toBeGreaterThanOrEqual(3)
  })
})

describe('jersey tiles', () => {
  it.each(Object.keys(light).filter((k) => k.startsWith('jersey-')))(
    'white text on %s is at least 4.5:1',
    (k) => {
      expect(ratio('#ffffff', light[k])).toBeGreaterThanOrEqual(4.5)
    },
  )
})
