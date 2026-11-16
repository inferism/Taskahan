import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { CreateGroupDialog } from './CreateGroupDialog'
import { codeError, normalizeCode, randomCode } from './codes'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

function renderDialog() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<CreateGroupDialog open onOpenChange={() => {}} />} />
          <Route path="/g/:id" element={<p>On the board</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fill(code: string) {
  await userEvent.type(screen.getByLabelText('Group name'), 'Capstone')
  await userEvent.type(screen.getByLabelText('Join code'), code)
  await userEvent.click(screen.getByRole('button', { name: 'Create group' }))
}

describe('codes', () => {
  it('normalizes and validates', () => {
    expect(normalizeCode(' ab cd ')).toBe('ABCD')
    expect(codeError('ABC')).toMatch(/5 more/)
    expect(codeError('ABCD1234')).toMatch(/letters only/)
    expect(codeError('ABCDEFGH')).toBeUndefined()
    expect(randomCode()).toMatch(/^[A-Z]{8}$/)
  })
})

describe('create group', () => {
  beforeEach(() => rpc.mockReset())

  it('validates the code live', async () => {
    renderDialog()
    const input = screen.getByLabelText('Join code')
    await userEvent.type(input, 'abc')
    expect(screen.getByText(/5 more to go/)).toBeInTheDocument()
    await userEvent.type(input, 'defgh')
    expect(screen.getByText('Looks good')).toBeInTheDocument()
  })

  it('does not submit an invalid form', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }))
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.getByText('Give the group a name')).toBeInTheDocument()
  })

  it('creates the group and lands on its board', async () => {
    rpc.mockResolvedValue({ data: 'g-new', error: null })
    renderDialog()
    await fill('abcdefgh')
    expect(rpc).toHaveBeenCalledWith(
      'create_group',
      expect.objectContaining({
        p_name: 'Capstone',
        p_purpose: 'student_project',
        p_member_limit: 10,
        p_join_code: 'ABCDEFGH',
      }),
    )
    expect(await screen.findByText('On the board')).toBeInTheDocument()
  })

  it('shows a clear error when the code is taken', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'join_code_taken' } })
    renderDialog()
    await fill('abcdefgh')
    expect(await screen.findByText('That code is taken. Pick another one.')).toBeInTheDocument()
    expect(screen.queryByText('On the board')).not.toBeInTheDocument()
  })
})
