import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/auth'
import type { Board } from '@/features/board/api'
import { supabase } from '@/lib/supabase'
import type { ThemePreference } from '@/lib/theme'

export interface Profile {
  username: string
  avatar_path: string | null
  theme: ThemePreference
  /** Seat in the caller's oldest active group, for the jersey preview. Null when in none. */
  seat: number | null
}

export const profileKey = ['profile'] as const

async function fetchProfile(userId: string): Promise<Profile> {
  const [profile, seat] = await Promise.all([
    supabase.from('profiles').select('username, avatar_path, theme').eq('id', userId).single(),
    supabase
      .from('memberships')
      .select('seat')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('joined_at')
      .limit(1),
  ])
  if (profile.error) throw profile.error
  if (seat.error) throw seat.error
  return {
    username: profile.data.username,
    avatar_path: profile.data.avatar_path,
    theme: profile.data.theme as ThemePreference,
    seat: seat.data[0]?.seat ?? null,
  }
}

/** The signed-in user's own profile. */
export function useProfile() {
  const userId = useAuth().session?.user.id
  return useQuery({
    queryKey: profileKey,
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
    staleTime: Infinity,
  })
}

export async function saveTheme(theme: ThemePreference) {
  const { error } = await supabase.rpc('set_theme', { p_theme: theme })
  if (error) throw error
}

async function finalize(path: string | null): Promise<void> {
  const { error } = await supabase.functions.invoke('set-avatar', { body: { path } })
  if (error) throw error
}

/** Uploads the encoded WebP into the caller's folder, then points the profile at it. */
export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.webp`
  const bucket = supabase.storage.from('avatars')
  const { error } = await bucket.upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw error
  try {
    await finalize(path)
  } catch (e) {
    // Not referenced by anything; the weekly sweep would get it, but tidy up now.
    await bucket.remove([path])
    throw e
  }
  return path
}

export async function removeAvatar(): Promise<void> {
  await finalize(null)
}

/** Shows the new photo everywhere the caller's seat is already on screen. */
export function patchOwnAvatar(queryClient: QueryClient, userId: string, path: string | null) {
  queryClient.setQueryData<Profile>(profileKey, (p) => p && { ...p, avatar_path: path })
  queryClient.setQueriesData<Board>({ queryKey: ['board'] }, (board) =>
    board
      ? {
          ...board,
          memberships: board.memberships.map((m) =>
            m.user_id === userId && m.status === 'active' ? { ...m, avatar_path: path } : m,
          ),
        }
      : board,
  )
}
