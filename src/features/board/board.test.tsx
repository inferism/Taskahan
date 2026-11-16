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

  it('expands a collapsed column when any part of it is clicked', async () => {
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    await userEvent.click(within(cara).getByText('Survey ten students'))
    expect(within(cara).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(screen.getByRole('region', { name: "ana's tasks" })).getAllByRole('button')[0],
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('folds Done to a count until opened', async () => {
    setWidth(1440)
    renderBoard()
    const ben = await screen.findByRole('region', { name: "ben's tasks" })
    const done = within(ben).getByRole('button', { name: 'Done · 1' })
    expect(done).toHaveAttribute('aria-expanded', 'false')
    expect(within(ben).queryByText('Draft the problem statement')).not.toBeVisible()
    await userEvent.click(done)
    expect(within(ben).getByText('Draft the problem statement')).toBeVisible()
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

describe('task details and status', () => {
  const serve = (board = seedBoard) =>
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === 'get_group_snapshot') return Promise.resolve({ data: board, error: null })
      if (name === 'set_task_status') {
        const t = board.tasks.find((x) => x.id === args.p_task_id)!
        return Promise.resolve({
          data: { ...t, status: args.p_status, deleted_at: null },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

  it('opens one task at a time inside a column', async () => {
    serve()
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    const row = within(cara).getByRole('button', { name: /Survey ten students/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(within(cara).getByRole('group', { name: 'Task #2 details' })).toBeVisible()
  })

  it('lets the assignee change status and updates the column', async () => {
    serve(seedBoardAsBen)
    setWidth(1440)
    renderBoard()
    const ben = await screen.findByRole('region', { name: "ben's tasks" })
    await userEvent.click(within(ben).getByRole('button', { name: /Book the demo room/ }))
    await userEvent.click(within(ben).getByRole('radio', { name: 'Done' }))
    expect(rpc).toHaveBeenCalledWith('set_task_status', { p_task_id: 't5', p_status: 'done' })
    expect(await within(ben).findByRole('button', { name: 'Done · 2' })).toBeInTheDocument()
  })

  it('shows status read-only to someone who is neither assignee nor leader', async () => {
    serve(seedBoardAsBen)
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    await userEvent.click(within(cara).getByRole('button', { name: /Survey ten students/ }))
    expect(within(cara).queryByRole('radio')).not.toBeInTheDocument()
    expect(within(cara).getByText('In progress')).toBeInTheDocument()
  })

  it("lets the leader change anyone's status", async () => {
    serve()
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    await userEvent.click(within(cara).getByRole('button', { name: /Survey ten students/ }))
    expect(within(cara).getAllByRole('radio')).toHaveLength(3)
  })

  it('says so inline when a status change fails, and retries', async () => {
    serve()
    rpc.mockImplementationOnce(() => Promise.resolve({ data: seedBoard, error: null }))
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    await userEvent.click(within(cara).getByRole('button', { name: /Survey ten students/ }))
    rpc.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { message: 'forbidden' } }),
    )
    await userEvent.click(within(cara).getByRole('radio', { name: 'Done' }))
    expect(await within(cara).findByRole('alert')).toHaveTextContent('Could not change the status')
    await userEvent.click(within(cara).getByRole('button', { name: 'Retry' }))
    expect(await within(cara).findByRole('button', { name: 'Done · 1' })).toBeInTheDocument()
  })
})

describe('add and edit task', () => {
  beforeAll(() => {
    // Radix Select leans on pointer capture and scrollIntoView, which jsdom lacks.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
  })

  const serve = (board: typeof seedBoard, onWrite: (name: string) => unknown) =>
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_group_snapshot'
          ? { data: board, error: null }
          : (onWrite(name) ?? { data: null, error: null }),
      ),
    )

  it('lets the leader add a task to a member', async () => {
    const created = {
      ...seedBoard.tasks[0],
      id: 't8',
      number: 8,
      title: 'Print posters',
      assignee_id: 'cara',
      status: 'todo',
      deleted_at: null,
    }
    serve(seedBoard, (name) => (name === 'create_task' ? { data: created, error: null } : null))
    setWidth(1440)
    renderBoard()
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a task' })
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Print posters')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Assignee' }))
    await userEvent.click(await screen.findByRole('option', { name: '#3 cara' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add task' }))
    expect(rpc).toHaveBeenCalledWith('create_task', {
      p_group_id: 'capstone',
      p_title: 'Print posters',
      p_details: '',
      p_assignee_id: 'cara',
      p_deadline: null,
    })
    const cara = screen.getByRole('region', { name: "cara's tasks" })
    expect(await within(cara).findByText('Print posters')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves a reassigned task to the new column', async () => {
    const moved = { ...seedBoard.tasks[1], assignee_id: 'dev', deleted_at: null }
    serve(seedBoard, (name) => (name === 'update_task' ? { data: moved, error: null } : null))
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    await userEvent.click(within(cara).getByRole('button', { name: /Survey ten students/ }))
    await userEvent.click(within(cara).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit task #2' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Survey ten students')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Assignee' }))
    await userEvent.click(await screen.findByRole('option', { name: '#4 dev' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }))
    const dev = screen.getByRole('region', { name: "dev's tasks" })
    expect(await within(dev).findByText('Survey ten students')).toBeInTheDocument()
    expect(within(cara).queryByText('Survey ten students')).not.toBeInTheDocument()
  })

  it('shows a member neither Add task nor Edit', async () => {
    serve(seedBoardAsBen, () => null)
    setWidth(1440)
    renderBoard()
    const ben = await screen.findByRole('region', { name: "ben's tasks" })
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
    await userEvent.click(within(ben).getByRole('button', { name: /Book the demo room/ }))
    expect(within(ben).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('keeps the dialog open and explains when the server refuses', async () => {
    serve(seedBoard, (name) =>
      name === 'create_task' ? { data: null, error: { message: 'forbidden' } } : null,
    )
    setWidth(1440)
    renderBoard()
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Something')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add task' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Only the leader')
  })

  it('asks for a title before sending anything', async () => {
    serve(seedBoard, () => null)
    setWidth(1440)
    renderBoard()
    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add task' }))
    expect(within(dialog).getByText('Give the task a title')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalledWith('create_task', expect.anything())
  })
})
