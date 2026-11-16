/** Join codes are 8 letters, A to Z. Spaces and case do not matter when typing. */
export const CODE_LENGTH = 8

export function normalizeCode(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase()
}

export function codeError(raw: string): string | undefined {
  const code = normalizeCode(raw)
  if (/[^A-Z]/.test(code)) return 'Codes use letters only, A to Z'
  if (code.length < CODE_LENGTH)
    return `${CODE_LENGTH - code.length} more to go. Codes are 8 letters`
  if (code.length > CODE_LENGTH) return 'Codes are 8 letters'
}

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => String.fromCharCode(65 + (b % 26))).join('')
}
