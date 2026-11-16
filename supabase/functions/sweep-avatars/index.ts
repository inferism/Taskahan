// 9.3 sweep-avatars: delete avatar objects that no profile points at.
// See ARCHITECTURE.md section 8.
//
// Called weekly by pg_cron (private.call_sweep_avatars) with the shared secret
// in x-cron-secret. JWT verification is off for this function in config.toml.
// orphan_avatars skips objects younger than an hour so a fresh upload that
// set-avatar has not finalized yet is left alone.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'avatars'
const BATCH = 500
const MAX_BATCHES = 20

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Compares digests so the time taken does not depend on the secret.
async function sameSecret(given: string, expected: string) {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const expected = Deno.env.get('CRON_SECRET') ?? ''
  const given = req.headers.get('x-cron-secret') ?? ''
  if (expected.length < 16 || !(await sameSecret(given, expected))) {
    return reply(401, { error: 'unauthorized' })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  let deleted = 0

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await admin.rpc('orphan_avatars', { p_limit: BATCH })
    if (error) {
      console.error('orphan_avatars failed', error.message)
      return reply(500, { error: 'server_error', deleted })
    }

    const names = (data as { name: string }[]).map((r) => r.name)
    if (names.length === 0) break

    const { data: removed, error: removeError } = await admin.storage.from(BUCKET).remove(names)
    if (removeError) {
      console.error('avatar remove failed', removeError.message)
      return reply(500, { error: 'server_error', deleted })
    }
    // Nothing removed means the same names would come back; stop instead of looping.
    if (!removed || removed.length === 0) break
    deleted += removed.length

    if (names.length < BATCH) break
  }

  console.log('sweep-avatars done', { deleted })
  return reply(200, { deleted })
})
