import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/ui'
import { AuthLayout } from './AuthLayout'
import { usernameToEmail } from './credentials'

export function LoginPage() {
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    setBusy(false)
    if (err) {
      setError(
        err.status === 429 || err.status === 0
          ? 'Could not reach the server. Try again in a moment.'
          : 'Wrong username or password',
      )
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
