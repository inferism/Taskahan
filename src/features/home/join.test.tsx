import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { JoinGroupDialog } from './JoinGroupDialog'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

function renderDialog() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<JoinGroupDialog open onOpenChange={() => {}} />} />
          <Route path="/g/:id" element={<p>On the board</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function join(code: string) {
  await userEvent.type(screen.getByLabelText('Join code'), code)
  await userEvent.click(screen.getByRole('button', { name: 'Join group' }))
}

describe('join group', () => {
  beforeEach(() => rpc.mockReset())

  it('joins and lands on the board', async () => {
    rpc.mockResolvedValue({ data: 'g1', error: null })
    renderDialog()
    await join('abcd efgh')
    expect(rpc).toHaveBeenCalledWith('join_group', { p_join_code: 'ABCDEFGH' })
    expect(await screen.findByText('On the board')).toBeInTheDocument()
  })

  it('does not call the server for a malformed code', async () => {
    renderDialog()
    await join('abc')
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.getByText(/Codes are 8 letters/)).toBeInTheDocument()
  })

  it('gives one generic message for every refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    renderDialog()
    await join('abcdefgh')
    expect(await screen.findByText(/That code did not work/)).toBeInTheDocument()
  })

  it('explains the rate limit', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited' } })
    renderDialog()
    await join('abcdefgh')
    expect(await screen.findByText(/Too many tries/)).toBeInTheDocument()
  })
})
