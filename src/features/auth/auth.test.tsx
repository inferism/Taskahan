import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { LoginPage } from './LoginPage'
import { SignupPage } from './SignupPage'
import { passwordError, usernameError, usernameToEmail } from './credentials'
import { Turnstile } from './Turnstile'

const { signUp, signIn } = vi.hoisted(() => ({ signUp: vi.fn(), signIn: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp, signInWithPassword: signIn } },
}))

beforeEach(() => vi.stubEnv('VITE_TURNSTILE_SITE_KEY', ''))
afterEach(() => vi.unstubAllEnvs())

describe('credentials', () => {
  it('derives the synthetic email', () => {
    expect(usernameToEmail(' Kim_1 ')).toMatch(/^kim_1@users\./)
  })
  it('validates username and password', () => {
    expect(usernameError('ab')).toBeDefined()
    expect(usernameError('kim_1')).toBeUndefined()
    expect(usernameError('Kim_1')).toBeUndefined()
    expect(passwordError('short', 'kim')).toBeDefined()
    expect(passwordError('samename1', 'samename1')).toBeDefined()
    expect(passwordError('longenough1', 'kim')).toBeUndefined()
  })
  it('limits passwords to 72 bytes, not 72 characters', () => {
    expect(passwordError('é'.repeat(36), 'kim')).toBeUndefined() // 72 bytes
    expect(passwordError('é'.repeat(40), 'kim')).toMatch(/72/) // 80 bytes
  })
})

describe('turnstile', () => {
  it('offers a retry when the script fails to load', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')))
      return node
    })
    render(<Turnstile onToken={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(append).toHaveBeenCalledTimes(2)
    append.mockRestore()
  })

  it('offers a working retry when the script loads without the Turnstile global', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')))
      return node
    })
    render(<Turnstile onToken={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(append).toHaveBeenCalledTimes(2)
    append.mockRestore()
  })
})

describe('signup', () => {
  it('shows the no-recovery and 30-day notice and submits', async () => {
    signUp.mockResolvedValue({ error: null })
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/No email and no password reset/)).toHaveTextContent(/30 days/)
    await userEvent.type(screen.getByLabelText('Username'), 'kim_1')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse 9')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ password: 'correct horse 9' }))
  })

  it('does not submit an invalid username', async () => {
    signUp.mockClear()
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText('Username'), 'ab')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse 9')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(signUp).not.toHaveBeenCalled()
  })
})

describe('login', () => {
  it('shows a generic error on failure', async () => {
    signIn.mockResolvedValue({ error: { status: 400, message: 'Invalid login credentials' } })
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText('Username'), 'kim_1')
    await userEvent.type(screen.getByLabelText('Password'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Wrong username or password')).toBeInTheDocument()
  })

  it('sends the Turnstile token when CAPTCHA is on', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
    window.turnstile = {
      render: (_el, opts) => {
        ;(opts.callback as (t: string) => void)('tok-1')
        return 'w1'
      },
      remove: () => {},
    }
    signIn.mockResolvedValue({ error: null })
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText('Username'), 'kim_1')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse 9')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(signIn).toHaveBeenCalledWith(
      expect.objectContaining({ options: { captchaToken: 'tok-1' } }),
    )
    delete window.turnstile
  })
})
