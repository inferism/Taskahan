import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { ToastProvider } from '@/ui'
import { checkFile, compress, MAX_FILE_BYTES, QUALITIES } from './image'
import { SettingsPage } from './SettingsPage'
import { ThemeSync } from './ThemeSync'

const { rpc, signOut, saved } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: null, error: null })),
  signOut: vi.fn(async () => ({ error: null })),
  saved: { theme: 'dark' },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    auth: { signOut },
    from: (table: string) => {
      const result =
        table === 'profiles'
          ? { data: { username: 'ana', avatar_path: null, theme: saved.theme }, error: null }
          : { data: [{ seat: 3 }], error: null }
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => chain,
        then: (resolve: (v: unknown) => void) => resolve(result),
      }
      return chain
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}))
vi.mock('@/app/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u-ana' } } }) }))

const bytes = (...head: number[]) => new Uint8Array([...head, ...new Array(32).fill(0)])
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0)
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const webp = bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8 '))
const pdf = bytes(...ascii('%PDF-1.7'))

describe('picking a photo (8.2)', () => {
  it('accepts real JPEG, PNG and WebP files', async () => {
    expect(await checkFile(new File([jpeg], 'a.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(await checkFile(new File([png], 'a.png', { type: 'image/png' }))).toBeNull()
    expect(await checkFile(new File([webp], 'a.webp', { type: 'image/webp' }))).toBeNull()
  })

  it('refuses a PDF renamed .jpg', async () => {
    expect(await checkFile(new File([pdf], 'photo.jpg', { type: 'image/jpeg' }))).toBe('type')
  })

  it('refuses other types and files over 10 MB', async () => {
    expect(await checkFile(new File([pdf], 'a.pdf', { type: 'application/pdf' }))).toBe('type')
    expect(await checkFile(new File([jpeg], 'a.gif', { type: 'image/gif' }))).toBe('type')
    const big = new File([jpeg, new Uint8Array(MAX_FILE_BYTES)], 'big.jpg', { type: 'image/jpeg' })
    expect(await checkFile(big)).toBe('size')
  })
})

describe('compressing the crop (8.2)', () => {
  const blob = (kb: number, type = 'image/webp') => new Blob([new Uint8Array(kb * 1024)], { type })

  it('steps quality down from 0.82 until the WebP is under 150 KB', async () => {
    const sizes = [400, 220, 149]
    const encode = vi.fn(async (quality: number) => (quality > 0 ? blob(sizes.shift()!) : null))
    const out = await compress(encode)
    expect(out.type).toBe('image/webp')
    expect(out.size).toBeLessThan(150 * 1024)
    expect(encode.mock.calls.map(([q]) => q)).toEqual(QUALITIES.slice(0, 3))
  })

  it('refuses a browser that hands back PNG instead of WebP', async () => {
    await expect(compress(async () => blob(10, 'image/png'))).rejects.toThrow('encode')
  })

  it('gives up when even the lowest quality is too big', async () => {
    await expect(compress(async () => blob(500))).rejects.toThrow('too_big')
  })
})

function renderSettings() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <ThemeSync />
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('settings page (8.3)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    rpc.mockClear()
    signOut.mockClear()
    saved.theme = 'dark'
  })

  afterAll(() => {
    // @ts-expect-error restore jsdom's missing matchMedia
    delete window.matchMedia
  })

  it('applies the theme saved on the account, so it follows to a new device', async () => {
    renderSettings()
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(await screen.findByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('saves a new theme to the account and paints it at once', async () => {
    saved.theme = 'system'
    renderSettings()
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Light' })).toBeEnabled())
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(rpc).toHaveBeenCalledWith('set_theme', { p_theme: 'light' })
  })

  it('shows the jersey number from the oldest group', async () => {
    renderSettings()
    expect(await screen.findByRole('img', { name: 'ana, number 03' })).toBeInTheDocument()
  })

  it('refuses a PDF renamed .jpg without opening the cropper', async () => {
    renderSettings()
    await userEvent.upload(
      screen.getByLabelText('Photo file'),
      new File([pdf], 'photo.jpg', { type: 'image/jpeg' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a JPEG, PNG or WebP photo.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('logs out', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(signOut).toHaveBeenCalled()
  })
})
