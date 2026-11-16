import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import type { HomeGroup } from './api'
import { LeaveGroupDialog } from './LeaveGroupDialog'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const base: HomeGroup = {
  id: 'g1',
  name: 'Capstone',
  purpose: 'student_project',
  purposeNote: null,
  role: 'member',
  memberCount: 3,
  done: 0,
  total: 0,
}

function renderDialog(group: HomeGroup, onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <LeaveGroupDialog group={group} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onOpenChange
}

describe('leave group', () => {
  beforeEach(() => rpc.mockReset())

  it('lets a member leave and says the column stays', async () => {
    rpc.mockResolvedValue({ error: null })
    const onOpenChange = renderDialog(base)
    expect(screen.getByText(/stays on the board as a former member/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Leave group' }))
    expect(rpc).toHaveBeenCalledWith('leave_group', { p_group_id: 'g1' })
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('explains the transfer rule to a leader with other members and offers no leave', () => {
    renderDialog({ ...base, role: 'leader' })
    expect(screen.getByText(/make another member the Leader before you leave/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave group' })).not.toBeInTheDocument()
  })

  it('warns a last-member leader that leaving deletes the group', () => {
    renderDialog({ ...base, role: 'leader', memberCount: 1 })
    expect(screen.getByText(/deletes the group/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeInTheDocument()
  })

  it('shows the server refusal inline', async () => {
    rpc.mockResolvedValue({ error: { message: 'leader_must_transfer' } })
    renderDialog(base)
    await userEvent.click(screen.getByRole('button', { name: 'Leave group' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Make another member the Leader/)
  })
})
