import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { clearOnline, setOnline } from '@/realtime/presence'
import { BoardPage } from './BoardPage'
import { TaskRefs } from './TaskRefs'
import { splitTaskRefs } from './taskLinks'
import { seedBoard, seedBoardAsBen } from './seed.fixture'

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
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }
      return chain
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    auth: { signOut: vi.fn() },
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch }
      return ch
    },
    removeChannel: vi.fn(async () => 'ok'),
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

/** Stands in for Home: shows the notice a board leaves behind. */
function HomeStub() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  return <h1>Home {notice}</h1>
}

function renderBoard(path = '/g/capstone', client = createQueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<HomeStub />} />
          <Route path="/g/:groupId" element={<BoardPage />} />
          <Route path="/g/:groupId/t/:number" element={<BoardPage />} />
        </Routes>
        <TaskRefs text="See #2 and #99" groupId="capstone" />
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
    // The guess is gone: the task is back where it was.
    expect(within(cara).queryByRole('button', { name: /Done · / })).not.toBeInTheDocument()
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

describe('task progress roster', () => {
  it('shows the same numbers as every column on the seed data', async () => {
    setWidth(1440)
    renderBoard()
    const roster = await screen.findByRole('region', { name: 'Task Progress' })
    const expected: Record<string, string> = {
      ana: 'No tasks yet',
      ben: '1 of 2 completed',
      cara: '0 of 1 completed',
      dev: '1 of 2 completed · 1 blocked',
      eli: '0 of 2 completed',
    }
    for (const [id, text] of Object.entries(expected)) {
      const row = roster.querySelector(`[data-progress="${id}"]`)!
      // The blocked glyph is an SVG with a "?" in it.
      expect(row.textContent?.replace('?', '')).toBe(text)
      const column = screen.getByRole('region', { name: `${id}'s tasks` })
      expect(within(column).getAllByText(/completed|No tasks yet/)[0]).toHaveTextContent(
        text.split(' · ')[0],
      )
    }
  })

  it('draws the stacked bar from done and in progress', async () => {
    setWidth(1440)
    renderBoard()
    const roster = await screen.findByRole('region', { name: 'Task Progress' })
    expect(
      within(roster).getByRole('img', { name: '1 done, 0 in progress, 1 to do' }),
    ).toBeInTheDocument()
    expect(
      within(roster).getByRole('img', { name: '0 done, 1 in progress, 0 to do' }),
    ).toBeInTheDocument()
  })

  it("jumps to a member's column when their row is clicked", async () => {
    setWidth(1440)
    renderBoard()
    const roster = await screen.findByRole('region', { name: 'Task Progress' })
    await userEvent.click(within(roster).getByRole('button', { name: /^cara/ }))
    const cara = screen.getByRole('region', { name: "cara's tasks" })
    expect(within(cara).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('task deep links', () => {
  it('opens the task named in the URL, in its own column', async () => {
    setWidth(1440)
    renderBoard('/g/capstone/t/2')
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    expect(within(cara).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true')
    expect(within(cara).getByRole('button', { name: /Survey ten students/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(cara).getByRole('group', { name: 'Task #2 details' })).toBeVisible()
  })

  it('opens a task when a #2 reference is followed', async () => {
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    expect(within(cara).getByRole('button', { name: /Survey ten students/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await userEvent.click(screen.getByRole('link', { name: '#2' }))
    expect(within(cara).getByRole('button', { name: /Survey ten students/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('says so when the task is not on the board', async () => {
    setWidth(1440)
    renderBoard('/g/capstone/t/99')
    expect(await screen.findByRole('status')).toHaveTextContent('Task #99 is not on this board')
  })

  it('opens a deep link on a phone, on the Board tab', async () => {
    setWidth(390)
    renderBoard('/g/capstone/t/2')
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    expect(within(cara).getByRole('group', { name: 'Task #2 details' })).toBeVisible()
  })
})

describe('task references', () => {
  it('splits #12 out of text and leaves look-alikes alone', () => {
    expect(splitTaskRefs('Kim took over #13 and #16')).toEqual([
      'Kim took over ',
      { number: 13 },
      ' and ',
      { number: 16 },
    ])
    expect(splitTaskRefs('#4 first')).toEqual([{ number: 4 }, ' first'])
    expect(splitTaskRefs('colour #fff, issue#5, page.html#7')).toEqual([
      'colour #fff, issue#5, page.html#7',
    ])
  })

  it('links each reference to the task URL', async () => {
    setWidth(1440)
    renderBoard()
    await screen.findByRole('region', { name: 'Task Progress' })
    expect(screen.getByRole('link', { name: '#99' })).toHaveAttribute('href', '/g/capstone/t/99')
  })
})

describe('loading, empty and error states', () => {
  it('shows the board layout in track colour while loading, with no spinner', async () => {
    rpc.mockReturnValue(new Promise(() => {}))
    setWidth(1440)
    renderBoard()
    const loading = await screen.findByLabelText('Loading board')
    expect(loading).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('tells the leader what to do in an empty column', async () => {
    setWidth(1440)
    renderBoard()
    const ana = await screen.findByRole('region', { name: "ana's tasks" })
    expect(
      within(ana).getByText(/No tasks yet\. Use Add task to give yourself one\./),
    ).toBeInTheDocument()
  })

  it('tells a member with nothing assigned who will assign', async () => {
    rpc.mockResolvedValue({ data: { ...seedBoardAsBen, tasks: [] }, error: null })
    setWidth(1440)
    renderBoard()
    const ben = await screen.findByRole('region', { name: "ben's tasks" })
    expect(within(ben).getByText(/Your leader will assign tasks here/)).toBeInTheDocument()
  })

  it('shows an error with Retry when the board will not load, then recovers', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } })
    setWidth(1440)
    renderBoard()
    const alert = await screen.findByRole('alert', undefined, { timeout: 4000 })
    expect(alert).toHaveTextContent('Could not load the board')
    rpc.mockResolvedValue({ data: seedBoard, error: null })
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('region', { name: "ana's tasks" })).toBeInTheDocument()
  })

  it('keeps the last board on screen when a refresh fails, with Retry', async () => {
    const client = createQueryClient()
    setWidth(1440)
    renderBoard('/g/capstone', client)
    await screen.findByRole('region', { name: "ana's tasks" })
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } })
    void client.invalidateQueries({ queryKey: ['board', 'capstone'] })
    const alert = await screen.findByRole('alert', undefined, { timeout: 4000 })
    expect(alert).toHaveTextContent('Could not refresh the board')
    expect(screen.getByRole('region', { name: "ana's tasks" })).toBeInTheDocument()
    rpc.mockResolvedValue({ data: seedBoard, error: null })
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('review fixes', () => {
  it('drops the cached board when the server says forbidden', async () => {
    const client = createQueryClient()
    setWidth(1440)
    renderBoard('/g/capstone', client)
    await screen.findByRole('region', { name: "ana's tasks" })
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    void client.invalidateQueries({ queryKey: ['board', 'capstone'] })
    // Access ended while the board was open: out of the board, with the cache dropped.
    expect(
      await screen.findByRole('heading', { name: /^Home You no longer have access/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: "ana's tasks" })).not.toBeInTheDocument()
    expect(client.getQueryData(['board', 'capstone'])).toBeUndefined()
  })

  it('still explains a board that was never allowed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    setWidth(1440)
    renderBoard()
    expect(await screen.findByRole('heading', { name: 'Board not available' })).toBeInTheDocument()
  })

  it('takes one status change at a time, so answers cannot land out of order', async () => {
    let answer: (v: unknown) => void = () => {}
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === 'get_group_snapshot') return Promise.resolve({ data: seedBoard, error: null })
      const t = seedBoard.tasks.find((x) => x.id === args.p_task_id)!
      return new Promise(
        (resolve) =>
          (answer = () => resolve({ data: { ...t, status: args.p_status }, error: null })),
      )
    })
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    await userEvent.click(within(cara).getByRole('button', { name: /Survey ten students/ }))
    await userEvent.click(within(cara).getByRole('radio', { name: 'Done' }))
    for (const radio of within(cara).getAllByRole('radio')) expect(radio).toBeDisabled()
    await userEvent.click(within(cara).getByRole('radio', { name: 'To do' }))
    expect(rpc.mock.calls.filter(([n]) => n === 'set_task_status')).toHaveLength(1)
    answer(undefined)
    await waitFor(() => {
      for (const radio of within(cara).getAllByRole('radio')) expect(radio).toBeEnabled()
    })
    expect(within(cara).getByRole('button', { name: /Done · 1/ })).toBeInTheDocument()
  })

  it('unfolds Done when a link opens a finished task', async () => {
    setWidth(1440)
    renderBoard('/g/capstone/t/1')
    const ben = await screen.findByRole('region', { name: "ben's tasks" })
    expect(within(ben).getByRole('button', { name: 'Done · 1' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(ben).getByRole('group', { name: 'Task #1 details' })).toBeVisible()
  })

  it('puts the phone pager back on the same member after another tab', async () => {
    const scrolls: number[] = []
    // jsdom has no scrolling; record where the phone pager is asked to go.
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, opts?: ScrollToOptions | number) {
      if (typeof opts === 'object' && this.className.includes('snap-x')) scrolls.push(opts.left!)
    } as HTMLElement['scrollTo']
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390)
    try {
      setWidth(390)
      renderBoard()
      const pager = await screen.findByRole('navigation', { name: 'Members' })
      await userEvent.click(within(pager).getByRole('button', { name: 'cara' }))
      const tabs = screen.getByRole('navigation', { name: 'Board sections' })
      await userEvent.click(within(tabs).getByRole('button', { name: 'Progress' }))
      scrolls.length = 0
      await userEvent.click(within(tabs).getByRole('button', { name: 'Board' }))
      expect(scrolls).toEqual([2 * 390])
      expect(
        within(screen.getByRole('navigation', { name: 'Members' })).getByRole('button', {
          name: 'cara',
        }),
      ).toHaveAttribute('aria-current', 'true')
    } finally {
      // @ts-expect-error remove the stub again; jsdom does not provide scrollTo
      delete HTMLElement.prototype.scrollTo
      width.mockRestore()
    }
  })
})

describe('presence', () => {
  afterEach(() => clearOnline('capstone'))

  it('shows who is online on the header, the columns and the roster', async () => {
    setWidth(1440)
    renderBoard()
    const ana = await screen.findByRole('region', { name: "ana's tasks" })
    expect(within(ana).getByText(/^Offline · /)).toBeInTheDocument()
    expect(screen.getByText('0 online')).toBeInTheDocument()
    // A claimed id that is not on the board is ignored.
    act(() => setOnline('capstone', new Set(['ana', 'ben', 'stranger'])))
    expect(await screen.findByText('2 online')).toBeInTheDocument()
    expect(within(ana).getByText(/^Online · /)).toBeInTheDocument()
    expect(within(ana).getByRole('img', { name: /, online$/ })).toBeInTheDocument()
    act(() => setOnline('capstone', new Set(['ben'])))
    expect(await screen.findByText('1 online')).toBeInTheDocument()
    expect(within(ana).getByText(/^Offline · /)).toBeInTheDocument()
  })
})

describe('removed while open', () => {
  it('goes Home with a notice when the own membership flips to former', async () => {
    const client = createQueryClient()
    setWidth(1440)
    renderBoard('/g/capstone', client)
    await screen.findByRole('region', { name: "ana's tasks" })
    const mine = seedBoard.memberships.find((m) => m.id === seedBoard.me)!
    act(() =>
      client.setQueryData(['board', 'capstone'], {
        ...seedBoard,
        memberships: seedBoard.memberships.map((m) =>
          m.id === mine.id ? { ...m, status: 'former', left_reason: 'removed' } : m,
        ),
      }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Home You were removed from Capstone Crew.' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: "ana's tasks" })).not.toBeInTheDocument()
  })
})

describe('second review fixes', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
  })

  it('keeps a dialog opened later when an earlier, cancelled save finally answers', async () => {
    let answer: () => void = () => {}
    const created = {
      ...seedBoard.tasks[0],
      id: 't8',
      number: 8,
      title: 'First task',
      assignee_id: 'ana',
      status: 'todo' as const,
      completed_at: null,
      deleted_at: null,
    }
    rpc.mockImplementation((name: string) =>
      name === 'get_group_snapshot'
        ? Promise.resolve({ data: seedBoard, error: null })
        : new Promise((resolve) => (answer = () => resolve({ data: created, error: null }))),
    )
    setWidth(1440)
    const client = createQueryClient()
    renderBoard('/g/capstone', client)
    const addTask = await screen.findByRole('button', { name: 'Add task' })
    await userEvent.click(addTask)
    let dialog = await screen.findByRole('dialog', { name: 'Add a task' })
    await userEvent.type(within(dialog).getByLabelText('Title'), 'First task')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add task' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(addTask)
    dialog = await screen.findByRole('dialog', { name: 'Add a task' })
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Second draft')
    await act(async () => answer())

    expect(screen.getByRole('dialog', { name: 'Add a task' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Second draft')
    // The open dialog hides the board from the accessibility tree; the saved task is still there.
    const ana = screen.getByRole('region', { name: "ana's tasks", hidden: true })
    expect(await within(ana).findByText('First task')).toBeInTheDocument()
  })

  it('reopens a task when the same #2 link is followed again after closing it', async () => {
    setWidth(1440)
    renderBoard()
    const cara = await screen.findByRole('region', { name: "cara's tasks" })
    const row = within(cara).getByRole('button', { name: /Survey ten students/ })
    await userEvent.click(screen.getByRole('link', { name: '#2' }))
    expect(row).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(screen.getByRole('link', { name: '#2' }))
    expect(row).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens a linked task that only a later snapshot brings', async () => {
    const client = createQueryClient()
    setWidth(1440)
    renderBoard('/g/capstone/t/8', client)
    expect(await screen.findByRole('status')).toHaveTextContent('Task #8 is not on this board')
    const late = { ...seedBoard.tasks[4], id: 't8', number: 8, title: 'Arrived late' }
    rpc.mockResolvedValue({
      data: { ...seedBoard, tasks: [...seedBoard.tasks, late] },
      error: null,
    })
    await act(() => client.invalidateQueries({ queryKey: ['board', 'capstone'] }))
    const ben = screen.getByRole('region', { name: "ben's tasks" })
    expect(within(ben).getByRole('button', { name: /Arrived late/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('long titles', () => {
  it('shows the whole title once a task is open', async () => {
    const long = 'A'.repeat(116)
    rpc.mockResolvedValue({
      data: {
        ...seedBoardAsBen,
        tasks: seedBoardAsBen.tasks.map((t) => (t.number === 5 ? { ...t, title: long } : t)),
      },
      error: null,
    })
    setWidth(1440)
    renderBoard()
    const ben = await screen.findByRole('region', { name: "ben's tasks" })
    const title = within(ben).getByText(long)
    expect(title).toHaveClass('truncate')
    await userEvent.click(within(ben).getByRole('button', { name: new RegExp(long) }))
    expect(title).not.toHaveClass('truncate')
  })
})
