import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/ui'
import { AuthLayout } from './AuthLayout'
import { usernameToEmail } from './credentials'
import { Turnstile } from './Turnstile'

export function LoginPage() {
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [widgetKey, setWidgetKey] = useState(0)
  const needsToken = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (needsToken && !token) {
      setError('Wait for the bot check to finish, then try again.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
      options: token ? { captchaToken: token } : undefined,
    })
    setBusy(false)
    if (err) {
      setError(
        err.status === 429 || err.status === 0
          ? 'Could not reach the server. Try again in a moment.'
          : /captcha/i.test(err.message)
            ? 'The bot check failed. Try again.'
            : 'Wrong username or password',
      )
      // Tokens are single use.
      setToken(null)
      setWidgetKey((k) => k + 1)
      return
    }
    void navigate(from, { replace: true })
  }

  return (
    <AuthLayout title="Log in">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          error={error}
        />
        <Turnstile key={widgetKey} onToken={setToken} />
        <Button type="submit" variant="primary" busy={busy} busyLabel="Logging in…">
          Log in
        </Button>
      </form>
      <p className="text-label text-muted">
        New here?{' '}
        <Link to="/signup" className="font-semibold text-ink underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
