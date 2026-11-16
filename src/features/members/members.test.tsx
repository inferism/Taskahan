import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { BoardPage } from '@/features/board/BoardPage'
import { seedBoard, seedBoardAsBen } from '@/features/board/seed.fixture'

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

function setWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const matches = (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]))
    return { matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  }) as unknown as typeof window.matchMedia
}

/** Answers the snapshot with `board` and every write with `writes`. */
function answer(board = seedBoard, writes: Record<string, unknown> = {}) {
  rpc.mockImplementation(async (fn: string) =>
    fn === 'get_group_snapshot'
      ? { data: board, error: null }
      : { data: writes[fn] ?? null, error: null },
  )
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

const column = (name: string) => screen.findByRole('region', { name: `${name}'s tasks` })
const writes = (fn: string) => rpc.mock.calls.filter(([name]) => name === fn)

beforeEach(() => {
  rpc.mockReset()
  setWidth(1440)
  answer()
})

afterAll(() => {
  // @ts-expect-error restore jsdom's missing matchMedia
  delete window.matchMedia
})

describe('former member (7.1)', () => {
  it('labels the column, roster and a former author as a former member', async () => {
    renderBoard()
    const eli = await column('eli')
    expect(within(eli).getByText('#eli')).toBeInTheDocument()
    expect(within(eli).getByText('Former member')).toBeInTheDocument()
    expect(within(eli).getByRole('img', { name: /former member/ })).toBeInTheDocument()
    const roster = screen.getByRole('region', { name: 'Task Progress' })
    expect(within(roster).getByText('#eli')).toBeInTheDocument()
    expect(within(roster).getByText(/Former member/)).toBeInTheDocument()
  })

  it('offers no member menu on a former column and no photo or online dot', async () => {
    renderBoard()
    await column('eli')
    expect(screen.queryByRole('button', { name: 'Manage eli' })).not.toBeInTheDocument()
  })
})

describe('remove member (7.2)', () => {
  async function openRemove() {
    renderBoard()
    await column('ben')
    await userEvent.click(screen.getByRole('button', { name: 'Manage ben' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Remove from group/ }))
    return screen.findByRole('dialog', { name: 'Remove ben?' })
  }

  it('spells out the consequences and ticks "change the join code" by default', async () => {
    const dialog = await openRemove()
    expect(within(dialog).getByText(/column stays on the board as a former member/)).toBeVisible()
    expect(within(dialog).getByText(/cannot rejoin/)).toBeVisible()
    expect(
      within(dialog).getByRole('checkbox', { name: /Also change the join code/ }),
    ).toBeChecked()
  })

  it('removes with a fresh code and turns the column into a former member', async () => {
    const dialog = await openRemove()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove member' }))
    await screen.findAllByText('#ben')
    const [, args] = writes('remove_member')[0]
    expect(args.p_member_id).toBe('ben')
    expect(args.p_new_join_code).toMatch(/^[A-Z]{8}$/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the code when the box is unticked', async () => {
    const dialog = await openRemove()
    await userEvent.click(within(dialog).getByRole('checkbox'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove member' }))
    await screen.findAllByText('#ben')
    expect(writes('remove_member')[0][1].p_new_join_code).toBeUndefined()
  })

  it('retries with another code when one is taken, then shows the error if it keeps failing', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'get_group_snapshot'
        ? { data: seedBoard, error: null }
        : { data: null, error: { message: 'join_code_taken' } },
    )
    const dialog = await openRemove()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove member' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not remove them')
    expect(writes('remove_member')).toHaveLength(3)
  })

  it('is not offered to a member', async () => {
    answer(seedBoardAsBen)
    renderBoard()
    await column('ana')
    expect(screen.queryByRole('button', { name: /^Manage / })).not.toBeInTheDocument()
  })
})

describe('transfer leadership (7.3)', () => {
  it('asks "Are you sure", then swaps roles so the old leader loses Logs and Add task', async () => {
    renderBoard()
    await column('cara')
    expect(screen.getByRole('tab', { name: 'Logs' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add task' }).length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Manage cara' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Make Leader/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Make cara the Leader?' })
    expect(within(dialog).getByText(/Are you sure\?/)).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: /Yes, make cara Leader/ }))

    expect(writes('transfer_leadership')[0][1]).toEqual({ p_member_id: 'cara' })
    await screen.findByText('Offline · Leader')
    expect(screen.queryByRole('tab', { name: 'Logs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Group settings' })).not.toBeInTheDocument()
  })

  it('changes nothing when cancelled', async () => {
    renderBoard()
    await column('cara')
    await userEvent.click(screen.getByRole('button', { name: 'Manage cara' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Make Leader/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(writes('transfer_leadership')).toHaveLength(0)
    expect(screen.getByRole('tab', { name: 'Logs' })).toBeInTheDocument()
  })
})

describe('take over (7.4)', () => {
  async function openTakeOver() {
    renderBoard()
    const eli = await column('eli')
    await userEvent.click(within(eli).getByRole('button', { name: 'Take over tasks' }))
    return screen.findByRole('dialog', { name: /Take over tasks from #eli/ })
  }

  it('lists the former member tasks with the open ones ticked', async () => {
    const dialog = await openTakeOver()
    const boxes = within(dialog).getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Take over 2 tasks' })).toBeEnabled()
  })

  it('leaves finished tasks unticked', async () => {
    const board = {
      ...seedBoard,
      tasks: seedBoard.tasks.map((t) => (t.id === 't7' ? { ...t, status: 'done' as const } : t)),
    }
    answer(board)
    const dialog = await openTakeOver()
    const done = within(dialog).getByRole('checkbox', { name: /Interview the faculty adviser/ })
    expect(done).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Take over 1 task' })).toBeEnabled()
  })

  it('moves the ticked tasks to the caller', async () => {
    answer(seedBoard, { take_over_tasks: [6, 7] })
    const dialog = await openTakeOver()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Interview the faculty/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Take over 1 task' }))
    expect(writes('take_over_tasks')[0][1]).toEqual({
      p_from_member_id: 'eli',
      p_task_ids: ['t6'],
    })
    const ana = await column('ana')
    expect(await within(ana).findByText('Collect consent forms')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: "eli's tasks" })).queryByText(
        'Collect consent forms',
      ),
    ).not.toBeInTheDocument()
  })

  it('cannot submit with nothing ticked', async () => {
    const dialog = await openTakeOver()
    for (const box of within(dialog).getAllByRole('checkbox')) await userEvent.click(box)
    expect(within(dialog).getByRole('button', { name: 'Take over 0 tasks' })).toBeDisabled()
  })

  it('is offered to a member too', async () => {
    answer(seedBoardAsBen)
    renderBoard()
    const eli = await column('eli')
    expect(within(eli).getByRole('button', { name: 'Take over tasks' })).toBeInTheDocument()
  })
})

describe('group settings (7.5)', () => {
  async function openSettings() {
    renderBoard()
    await column('ana')
    await userEvent.click(screen.getByRole('button', { name: 'Group settings' }))
    return screen.findByRole('dialog', { name: 'Group settings' })
  }

  it('is a leader-only control', async () => {
    answer(seedBoardAsBen)
    renderBoard()
    await column('ana')
    expect(screen.queryByRole('button', { name: 'Group settings' })).not.toBeInTheDocument()
  })

  it('starts from the saved values and saves a rename with a new purpose and limit', async () => {
    const dialog = await openSettings()
    expect(within(dialog).getByLabelText('Group name')).toHaveValue('Capstone Crew')
    expect(within(dialog).getByLabelText('Member limit')).toHaveValue(8)
    await userEvent.clear(within(dialog).getByLabelText('Group name'))
    await userEvent.type(within(dialog).getByLabelText('Group name'), 'Thesis Crew')
    await userEvent.clear(within(dialog).getByLabelText('Member limit'))
    await userEvent.type(within(dialog).getByLabelText('Member limit'), '12')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save settings' }))
    expect(writes('update_group')[0][1]).toMatchObject({
      p_group_id: 'capstone',
      p_name: 'Thesis Crew',
      p_purpose: 'student_project',
      p_member_limit: 12,
      p_join_code: 'CAPSTONE',
    })
    expect(await screen.findByRole('button', { name: /Group: Thesis Crew/ })).toBeInTheDocument()
  })

  it('refuses a limit below the people in the group, without calling the server', async () => {
    const dialog = await openSettings()
    await userEvent.clear(within(dialog).getByLabelText('Member limit'))
    await userEvent.type(within(dialog).getByLabelText('Member limit'), '3')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save settings' }))
    expect(within(dialog).getByText(/4 people are in the group now/)).toBeVisible()
    expect(writes('update_group')).toHaveLength(0)
  })

  it('suggests a new code and says the old one stops working', async () => {
    const dialog = await openSettings()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change code' }))
    expect(within(dialog).getByLabelText('Join code')).not.toHaveValue('CAPSTONE')
    expect(within(dialog).getByText(/old code stops working/)).toBeVisible()
  })

  it('shows a taken code next to the field', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'get_group_snapshot'
        ? { data: seedBoard, error: null }
        : { data: null, error: { message: 'join_code_taken' } },
    )
    const dialog = await openSettings()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save settings' }))
    expect(await within(dialog).findByText('That code is taken. Pick another one.')).toBeVisible()
  })

  it('copies the code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const dialog = await openSettings()
    await userEvent.click(within(dialog).getByRole('button', { name: /Copy join code CAPSTONE/ }))
    expect(writeText).toHaveBeenCalledWith('CAPSTONE')
  })
})
