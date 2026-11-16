import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { isAuthWeakPasswordError, type AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/ui'
import { AuthLayout } from './AuthLayout'
import { passwordError, passwordStrength, usernameError, usernameToEmail } from './credentials'
import { Turnstile } from './Turnstile'

function signupErrorMessage(error: AuthError): string {
  if (isAuthWeakPasswordError(error)) {
    if (error.reasons.includes('pwned'))
      return 'That password has appeared in a data leak. Choose a different one.'
    if (error.reasons.includes('characters'))
      return 'Password too simple. Mix upper and lower case letters, digits and symbols.'
    return 'Password too weak. Use a longer one.'
  }
  if (error.code === 'user_already_exists' || error.code === 'email_exists')
    return 'That username is taken. Try another.'
  if (error.code === 'captcha_failed' || /captcha/i.test(error.message))
    return 'The bot check failed. Try again.'
  if (error.status === 429 || error.code?.startsWith('over_'))
    return 'Too many sign ups right now. Wait a few minutes and try again.'
  if (/registered|already|database error/i.test(error.message))
    return 'That username is taken. Try another.'
  console.error('Sign up failed', error)
  return `Could not create the account: ${error.message}`
}

export function SignupPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [widgetKey, setWidgetKey] = useState(0)
  const [formError, setFormError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const uErr = touched ? usernameError(username) : undefined
  const pErr = touched ? passwordError(password, username) : undefined
  const needsToken = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setFormError(undefined)
    if (usernameError(username) || passwordError(password, username)) return
    if (needsToken && !token) {
      setFormError('Wait for the bot check to finish, then try again.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { username: username.trim() }, ...(token ? { captchaToken: token } : {}) },
    })
    setBusy(false)
    if (error) {
      setFormError(signupErrorMessage(error))
      // Tokens are single use.
      setToken(null)
      setWidgetKey((k) => k + 1)
      return
    }
    void navigate('/', { replace: true })
  }

  return (
    <AuthLayout title="Sign up">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          helper="3 to 20 characters: letters, digits and _. You cannot change it later."
          error={uErr}
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          helper={password ? `Strength: ${passwordStrength(password)}` : '8 to 72 characters'}
          error={pErr}
          required
        />
        <Turnstile key={widgetKey} onToken={setToken} />
        <p className="rounded-md border border-line bg-sunken p-3 text-label">
          No email and no password reset. If you forget your password you will need a new account.
          Accounts with no activity for 30 days are deleted.
        </p>
        {formError && (
          <p role="alert" className="text-label text-blocked">
            {formError}
          </p>
        )}
        <Button type="submit" variant="primary" busy={busy} busyLabel="Creating account…">
          Create account
        </Button>
      </form>
      <p className="text-label text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-ink underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
