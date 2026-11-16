import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { HomePage } from './HomePage'

const { tables, calls } = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown[]; error: unknown }>,
  calls: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let range: [number, number] | undefined
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: (col: string, v: unknown) => (calls.push(`${table}.is(${col},${v})`), chain),
        order: () => chain,
        range: (a: number, b: number) => (
          calls.push(`${table}.range(${a},${b})`),
          (range = [a, b]),
          chain
        ),
        then: (resolve: (v: unknown) => void) => {
          const { data, error } = tables[table]
          resolve({ data: range ? data.slice(range[0], range[1] + 1) : data, error })
        },
      }
      return chain
    },
  },
}))
vi.mock('@/app/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }))

function renderHome() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  calls.length = 0
  tables.groups = { data: [], error: null }
  tables.memberships = { data: [], error: null }
  tables.tasks = { data: [], error: null }
})

describe('home', () => {
  it('shows the empty state to a new user', async () => {
    renderHome()
    expect(
      await screen.findByText('Create a group to lead it, or join one with its 8-letter code.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
  })

  it('lists groups with purpose, role and progress', async () => {
    tables.groups.data = [
      {
        id: 'g1',
        name: 'Capstone',
        purpose: 'student_project',
        purpose_note: null,
        created_at: '2026-01-01',
      },
      {
        id: 'g2',
        name: 'Chess',
        purpose: 'other',
        purpose_note: 'Chess club',
        created_at: '2026-01-02',
      },
    ]
    tables.memberships.data = [
      { group_id: 'g1', user_id: 'me', role: 'leader' },
      { group_id: 'g1', user_id: 'u2', role: 'member' },
      { group_id: 'g2', user_id: 'me', role: 'member' },
    ]
    tables.tasks.data = [
      { group_id: 'g1', status: 'done' },
      { group_id: 'g1', status: 'todo' },
    ]
    renderHome()
    expect(await screen.findByRole('link', { name: 'Capstone' })).toHaveAttribute('href', '/g/g1')
    expect(screen.getByText('Student project')).toBeInTheDocument()
    expect(screen.getByText('Leader · 2 members')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 completed')).toBeInTheDocument()
    expect(screen.getByText('Chess club')).toBeInTheDocument()
    expect(screen.getByText('Member · 1 member')).toBeInTheDocument()
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    tables.groups.error = new Error('down')
    renderHome()
    // The query client retries once before giving up.
    expect(
      await screen.findByRole('button', { name: 'Retry' }, { timeout: 4000 }),
    ).toBeInTheDocument()
  })

  it('counts only live tasks, reading every page past the 1000-row cap', async () => {
    tables.groups.data = [
      { id: 'g1', name: 'Big', purpose: 'work_team', purpose_note: null, created_at: '2026-01-01' },
      {
        id: 'g2',
        name: 'Late',
        purpose: 'work_team',
        purpose_note: null,
        created_at: '2026-01-02',
      },
    ]
    tables.memberships.data = [
      { group_id: 'g1', user_id: 'me', role: 'member' },
      { group_id: 'g2', user_id: 'me', role: 'member' },
    ]
    // 1500 rows for g1 come first; g2's three tasks only appear on the second page.
    tables.tasks.data = [
      ...Array.from({ length: 1500 }, () => ({ group_id: 'g1', status: 'todo' })),
      { group_id: 'g2', status: 'done' },
      { group_id: 'g2', status: 'done' },
      { group_id: 'g2', status: 'todo' },
    ]
    renderHome()
    expect(await screen.findByText('0 of 1500 completed')).toBeInTheDocument()
    expect(screen.getByText('2 of 3 completed')).toBeInTheDocument()
    expect(calls).toEqual([
      'tasks.is(deleted_at,null)',
      'tasks.range(0,999)',
      'tasks.is(deleted_at,null)',
      'tasks.range(1000,1999)',
    ])
  })
})
