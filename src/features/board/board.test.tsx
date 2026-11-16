import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { BoardPage } from './BoardPage'
import { seedBoard, seedBoardAsBen } from './seed.fixture'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }
      return chain
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    auth: { signOut: vi.fn() },
  },
}))
vi.mock('@/app/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u-ana' } } }) }))

/** Pretend the window is this wide, as far as the layout's media queries go. */
function setWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const matches = (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]))
    return {
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  }) as unknown as typeof window.matchMedia
}

function renderBoard() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/g/capstone']}>
        <Routes>
          <Route path="/g/:groupId" element={<BoardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const columnNames = () =>
  screen
    .getAllByRole('region', { name: /'s tasks$/ })
    .map((c) => c.getAttribute('aria-label')!.replace("'s tasks", ''))

beforeEach(() => {
  rpc.mockResolvedValue({ data: seedBoard, error: null })
})

afterAll(() => {
  // @ts-expect-error restore jsdom's missing matchMedia
  delete window.matchMedia
})

describe('board shell', () => {
  it('shows roster, board and dock side by side on a wide screen', async () => {
    setWidth(1440)
    renderBoard()
    expect(await screen.findByRole('region', { name: 'Task Progress' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chat and logs' })).toBeInTheDocument()
    expect(columnNames()).toEqual(['ana', 'ben', 'cara', 'dev', 'eli'])
    expect(screen.getByRole('tab', { name: 'Logs' })).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('get_group_snapshot', { p_group_id: 'capstone' })
  })

  it('expands your own column first and one column at a time', async () => {
    setWidth(1440)
    renderBoard()
    const ana = await screen.findByRole('region', { name: "ana's tasks" })
    const ben = screen.getByRole('region', { name: "ben's tasks" })
    const header = (col: HTMLElement) => within(col).getAllByRole('button')[0]
    expect(header(ana)).toHaveAttribute('aria-expanded', 'true')
    expect(header(ben)).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(header(ben))
    expect(header(ana)).toHaveAttribute('aria-expanded', 'false')
    expect(header(ben)).toHaveAttribute('aria-expanded', 'true')
  })

  it('hides Logs from a member and puts their own column first', async () => {
    rpc.mockResolvedValue({ data: seedBoardAsBen, error: null })
    setWidth(1440)
    renderBoard()
    await screen.findByRole('region', { name: 'Chat and logs' })
    expect(screen.queryByRole('tab', { name: 'Logs' })).not.toBeInTheDocument()
    expect(columnNames()[0]).toBe('ben')
  })

  it('slides the roster and dock over the board between 768 and 1279, one at a time', async () => {
    setWidth(1024)
    renderBoard()
    const progress = await screen.findByRole('button', { name: 'Progress' })
    const chat = screen.getByRole('button', { name: 'Chat' })
    expect(screen.queryByRole('region', { name: 'Task Progress' })).not.toBeInTheDocument()

    await userEvent.click(progress)
    expect(screen.getByRole('region', { name: 'Task Progress' })).toBeInTheDocument()
    expect(progress).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(chat)
    expect(screen.queryByRole('region', { name: 'Task Progress' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(chat).toHaveAttribute('aria-expanded', 'false')
  })

  it('pages one column at a time with bottom tabs on a phone', async () => {
    setWidth(390)
    renderBoard()
    const tabs = await screen.findByRole('navigation', { name: 'Board sections' })
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Board', 'Progress', 'Chat', 'Logs'])
    const pager = screen.getByRole('navigation', { name: 'Members' })
    expect(within(pager).getAllByRole('button')).toHaveLength(5)
    expect(within(pager).getByRole('button', { name: 'ana (you)' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.queryByRole('region', { name: 'Task Progress' })).not.toBeInTheDocument()

    await userEvent.click(within(tabs).getByRole('button', { name: 'Progress' }))
    expect(screen.getByRole('region', { name: 'Task Progress' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Members' })).not.toBeInTheDocument()
  })

  it('tells a non-member the board is not available', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    setWidth(1440)
    renderBoard()
    expect(await screen.findByRole('heading', { name: 'Board not available' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your groups' })).toHaveAttribute('href', '/')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
