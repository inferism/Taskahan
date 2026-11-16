const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

/** The synthetic email Supabase Auth sees. Never shown to the user. */
export function usernameToEmail(username: string): string {
  const domain = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'taskahan.pages.dev'
  return `${username.trim().toLowerCase()}@users.${domain}`
}

export function usernameError(raw: string): string | undefined {
  if (!USERNAME_RE.test(raw.trim())) return 'Use 3 to 20 characters: letters, digits and _'
}

export function passwordError(password: string, username: string): string | undefined {
  // Supabase Auth caps passwords at 72 bytes; accented letters and emoji take 2 to 4 each.
  if (password.length < 8) return 'Use at least 8 characters'
  if (new TextEncoder().encode(password).length > 72)
    return 'Too long. Use at most 72 characters (fewer with accents or emoji)'
  if (password.toLowerCase() === username.trim().toLowerCase())
    return 'Choose a password different from your username'
}

export function passwordStrength(password: string): 'weak' | 'okay' | 'strong' {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
  if (password.length >= 12 && kinds >= 3) return 'strong'
  if (password.length >= 10 || (password.length >= 8 && kinds >= 3)) return 'okay'
  return 'weak'
}
