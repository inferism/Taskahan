import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { AuthProvider } from './auth'
import { ErrorBoundary } from './ErrorBoundary'
import { routes, withErrorElement } from './router'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }
      return chain
    },
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}))

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}

describe('auth guard', () => {
  it('redirects an unauthenticated visit to / to /login', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const router = renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('shows Home to a signed-in user and bounces them off /login', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    const router = renderAt('/login')
    expect(await screen.findByRole('heading', { name: 'Your groups' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('error boundary', () => {
  it('shows the recovery screen when a route throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => {
      throw new Error('boom')
    }
    const router = createMemoryRouter(withErrorElement([{ path: '/', element: <Boom /> }]))
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('shows a recovery screen when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => {
      throw new Error('boom')
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  })
})
