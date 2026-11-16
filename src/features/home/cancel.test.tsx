import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { HomePage } from './HomePage'

const { rpc, from, groups, gate } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  groups: [] as unknown[],
  // While set, reads of the group list wait for it, so a refresh can be held mid-way.
  gate: { held: null as Promise<void> | null },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from: (table: string) => {
      from(table)
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        range: () => chain,
        then: (resolve: (v: unknown) => void) => {
          const reply = () => resolve({ data: table === 'groups' ? groups : [], error: null })
          if (table === 'groups' && gate.held) void gate.held.then(reply)
          else reply()
        },
      }
      return chain
    },
    auth: { signOut: vi.fn() },
  },
}))
vi.mock('@/app/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }))

function renderHome() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/g/:id" element={<p>On the board</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * The next rpc call waits until the returned function answers it. Answering also lets the
 * follow-up work (the group list refresh, and any navigation after it) run to the end.
 */
function holdNextRpc(reply: unknown) {
  let answer: () => void = () => {}
  rpc.mockImplementationOnce(() => new Promise((resolve) => (answer = () => resolve(reply))))
  return () =>
    act(async () => {
      answer()
      await new Promise((r) => setTimeout(r, 50))
    })
}

const groupReads = () => from.mock.calls.filter(([t]) => t === 'groups').length

beforeEach(() => {
  gate.held = null
  rpc.mockReset()
  from.mockClear()
  groups.length = 0
})

describe('a cancelled group request', () => {
  it('Create: does not leave Home or touch the Join draft, but lists the new group', async () => {
    const answer = holdNextRpc({ data: 'g-new', error: null })
    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: 'Create' }))
    await userEvent.type(screen.getByLabelText('Group name'), 'Capstone')
    await userEvent.type(screen.getByLabelText('Join code'), 'abcdefgh')
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    await userEvent.type(screen.getByLabelText('Join code'), 'QWER')
    const before = groupReads()
    await answer()

    expect(screen.queryByText('On the board')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Join a group' })).toBeInTheDocument()
    expect(screen.getByLabelText('Join code')).toHaveValue('QWER')
    await waitFor(() => expect(groupReads()).toBeGreaterThan(before))
  })

  it('Join: does not leave Home or touch the Create draft', async () => {
    const answer = holdNextRpc({ data: 'g-joined', error: null })
    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }))
    await userEvent.type(screen.getByLabelText('Join code'), 'ABCDEFGH')
    await userEvent.click(screen.getByRole('button', { name: 'Join group' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    await userEvent.type(screen.getByLabelText('Group name'), 'Draft')
    await answer()

    expect(screen.queryByText('On the board')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Group name')).toHaveValue('Draft')
  })

  it('Leave: does not pull the user back Home from a board opened since', async () => {
    groups.push({
      id: 'g1',
      name: 'Capstone',
      purpose: 'student_project',
      purpose_note: null,
      created_at: '2026-01-01',
    })
    const answer = holdNextRpc({ error: null })
    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: 'Leave Capstone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Leave group' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('link', { name: 'Capstone' }))
    expect(screen.getByText('On the board')).toBeInTheDocument()
    await answer()

    expect(screen.getByText('On the board')).toBeInTheDocument()
  })

  it('Create: closed during the list refresh, it still stays on Home with the Join draft', async () => {
    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: 'Create' }))
    let release: () => void = () => {}
    gate.held = new Promise((r) => (release = r))
    rpc.mockResolvedValueOnce({ data: 'g-new', error: null })
    await userEvent.type(screen.getByLabelText('Group name'), 'Capstone')
    await userEvent.type(screen.getByLabelText('Join code'), 'abcdefgh')
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }))
    // The reply is in; the refresh that follows it is held.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    await userEvent.type(screen.getByLabelText('Join code'), 'QWER')

    await act(async () => {
      release()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.queryByText('On the board')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Join code')).toHaveValue('QWER')
  })

  it('Create: a reply after browser Back does not navigate', async () => {
    const answer = holdNextRpc({ data: 'g-new', error: null })
    const router = createMemoryRouter(
      [
        { path: '/', element: <HomePage /> },
        { path: '/elsewhere', element: <p>Somewhere else</p> },
        { path: '/g/:id', element: <p>On the board</p> },
      ],
      { initialEntries: ['/elsewhere', '/'], initialIndex: 1 },
    )
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Create' }))
    await userEvent.type(screen.getByLabelText('Group name'), 'Capstone')
    await userEvent.type(screen.getByLabelText('Join code'), 'abcdefgh')
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }))
    await act(() => router.navigate(-1))
    expect(screen.getByText('Somewhere else')).toBeInTheDocument()

    await answer()
    expect(router.state.location.pathname).toBe('/elsewhere')
  })
})
