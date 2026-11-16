import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { HomePage } from './HomePage'

const { tables } = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown[]; error: unknown }>,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (v: unknown) => void) => resolve(tables[table]),
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
})
