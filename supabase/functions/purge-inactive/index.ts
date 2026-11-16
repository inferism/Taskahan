// 9.2 purge-inactive: delete accounts with no authenticated activity for 30 days.
// See ARCHITECTURE.md section 7.
//
// Called once a day by pg_cron (private.call_purge_inactive) with the shared
// secret in x-cron-secret. JWT verification is off for this function in
// config.toml; the secret is the only way in.
//
// For each inactive account, in its own transaction:
//   1. release_inactive_account: re-checks inactivity, flips its seats to
//      former, hands over or deletes groups, returns the avatar path.
//   2. Deletes the avatar object.
//   3. Deletes the auth user. The profile cascades; memberships.user_id -> null.
// A failure is logged and the run moves on; the account is retried tomorrow.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'avatars'
const BATCH = 100
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

  const seen = new Set<string>()
  let purged = 0
  let skipped = 0
  let failed = 0

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await admin.rpc('inactive_accounts', { p_limit: BATCH })
    if (error) {
      console.error('inactive_accounts failed', error.message)
      return reply(500, { error: 'server_error', purged, skipped, failed })
    }

    // Accounts that failed earlier in this run stay in the list; stop once a
    // batch has nothing new.
    const ids = (data as { user_id: string }[]).map((r) => r.user_id).filter((id) => !seen.has(id))
    if (ids.length === 0) break

    for (const userId of ids) {
      seen.add(userId)
      try {
        const { data: rows, error: releaseError } = await admin.rpc('release_inactive_account', {
          p_user_id: userId,
        })
        if (releaseError) throw new Error(`release: ${releaseError.message}`)
        if (!rows || (rows as unknown[]).length === 0) {
          skipped++
          continue
        }

        const avatarPath = (rows as { avatar_path: string | null }[])[0].avatar_path
        if (avatarPath) {
          const { error: removeError } = await admin.storage.from(BUCKET).remove([avatarPath])
          // Not fatal: the weekly sweep deletes objects no profile points at.
          if (removeError) console.error('avatar remove failed', userId, removeError.message)
        }

        const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
        if (deleteError) throw new Error(`delete user: ${deleteError.message}`)
        purged++
      } catch (e) {
        failed++
        console.error('purge failed', userId, e instanceof Error ? e.message : String(e))
      }
    }

    if ((data as unknown[]).length < BATCH) break
  }

  console.log('purge-inactive done', { purged, skipped, failed })
  return reply(200, { purged, skipped, failed })
})
