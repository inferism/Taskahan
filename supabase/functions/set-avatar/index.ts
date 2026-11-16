// 8.1 set-avatar: point the caller's profile at an avatar they just uploaded.
// See ARCHITECTURE.md section 8, SECURITY.md section 7.
//
// POST { "path": "{user_id}/{uuid}.webp" } with the caller's JWT.
// Checks the object is in the caller's folder and is a real WebP, swaps
// profiles.avatar_path, then deletes the previous object.
// Errors return { "error": key } with a stable key, like the SQL functions.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'avatars'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// RIFF....WEBP, then a VP8, VP8L or VP8X chunk.
function isWebp(bytes: Uint8Array) {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  return (
    bytes.length >= 16 &&
    ascii(0, 4) === 'RIFF' &&
    ascii(8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 16))
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return reply(401, { error: 'unauthorized' })
  const userId = auth.user.id

  let path: unknown
  try {
    path = (await req.json())?.path
  } catch {
    return reply(400, { error: 'invalid_input' })
  }
  if (typeof path !== 'string' || !new RegExp(`^${userId}/${UUID}\\.webp$`).test(path)) {
    return reply(403, { error: 'forbidden' })
  }

  const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(path)
  if (downloadError || !file) return reply(404, { error: 'not_found' })

  if (!isWebp(new Uint8Array(await file.slice(0, 16).arrayBuffer()))) {
    // Not ours to keep: the bucket's MIME check trusts the declared type.
    await admin.storage.from(BUCKET).remove([path])
    return reply(400, { error: 'invalid_image' })
  }

  const { data: oldPath, error: swapError } = await admin.rpc('swap_avatar_path', {
    p_user_id: userId,
    p_path: path,
  })
  if (swapError) return reply(500, { error: 'server_error' })

  if (oldPath && oldPath !== path) {
    // A failure here leaves an orphan for the weekly sweep, not a broken profile.
    await admin.storage.from(BUCKET).remove([oldPath])
  }

  return reply(200, { avatar_path: path })
})
