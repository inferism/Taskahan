const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/** The synthetic email Supabase Auth sees. Never shown to the user. */
export function usernameToEmail(username: string): string {
  const domain = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'taskahan.pages.dev'
  return `${username.trim().toLowerCase()}@users.${domain}`
}

export function usernameError(raw: string): string | undefined {
  const name = raw.trim().toLowerCase()
  if (!USERNAME_RE.test(name)) return 'Use 3 to 20 characters: a to z, 0 to 9 and _'
}

export function passwordError(password: string, username: string): string | undefined {
  if (password.length < 8 || password.length > 72) return 'Use 8 to 72 characters'
  if (password.toLowerCase() === username.trim().toLowerCase())
    return 'Choose a password different from your username'
}

export function passwordStrength(password: string): 'weak' | 'okay' | 'strong' {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
  if (password.length >= 12 && kinds >= 3) return 'strong'
  if (password.length >= 10 || (password.length >= 8 && kinds >= 3)) return 'okay'
  return 'weak'
}
