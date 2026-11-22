import { ArrowLeft } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { applyTheme, getThemePreference, type ThemePreference } from '@/lib/theme'
import { Avatar, Button, SegmentedControl, useToast } from '@/ui'
import { avatarUrl } from '@/features/board/api'
import { useAuth } from '@/app/auth'
import {
  patchOwnAvatar,
  profileKey,
  removeAvatar,
  saveTheme,
  useProfile,
  type Profile,
} from './api'
import { AvatarCropper } from './AvatarCropper'
import { WorkspaceNav } from '@/ui/WorkspaceNav'
import { ACCEPT_ATTR, checkFile, pickMessages } from './image'

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="grid grid-cols-1 gap-5 border-b border-line py-6 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)]"
    >
      <h2 className="text-title font-semibold">{title}</h2>
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-5 shadow-card">
        {children}
      </div>
    </section>
  )
}

function PhotoSection({ profile }: { profile: Profile | undefined }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const userId = useAuth().session?.user.id
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<string>()
  const [removing, setRemoving] = useState(false)
  const seat = profile?.seat ?? 1
  const name = profile?.username ?? ''
  const hasPhoto = !!profile?.avatar_path

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = '' // picking the same file again still fires change
    if (!picked) return
    const issue = await checkFile(picked)
    setProblem(issue ? pickMessages[issue] : undefined)
    if (!issue) setFile(picked)
  }

  async function remove() {
    if (!userId) return
    setProblem(undefined)
    setRemoving(true)
    try {
      await removeAvatar()
      patchOwnAvatar(queryClient, userId, null)
      toast('Photo removed')
    } catch {
      setProblem('Could not remove the photo. Try again.')
    }
    setRemoving(false)
  }

  return (
    <Section title="Profile photo">
      <div className="flex items-center gap-4">
        <Avatar
          seat={seat}
          name={name}
          size={52}
          photoUrl={avatarUrl(profile?.avatar_path ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!profile} onClick={() => input.current?.click()}>
            {hasPhoto ? 'Change photo' : 'Add photo'}
          </Button>
          {hasPhoto && (
            <Button
              variant="quiet"
              busy={removing}
              busyLabel="Removing…"
              onClick={() => void remove()}
            >
              Remove photo
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-label="Photo file"
          onChange={(e) => void pick(e)}
        />
      </div>
      <p className="text-label text-muted">
        JPEG, PNG or WebP, up to 10 MB. Your photo is public to anyone who has its link, and the
        people in your groups see it next to your name.
      </p>
      {problem && (
        <p role="alert" className="text-label text-blocked">
          {problem}
        </p>
      )}
      <AvatarCropper
        file={file}
        onClose={() => setFile(null)}
        seat={seat}
        name={name}
        hasPhoto={hasPhoto}
      />
    </Section>
  )
}

function ThemeSection({ profile }: { profile: Profile | undefined }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [theme, setTheme] = useState<ThemePreference>(profile?.theme ?? getThemePreference())

  async function change(next: ThemePreference) {
    setTheme(next)
    applyTheme(next)
    queryClient.setQueryData<Profile>(profileKey, (p) => p && { ...p, theme: next })
    try {
      await saveTheme(next)
    } catch {
      toast('Could not save the theme to your account. It applies on this device only.')
    }
  }

  return (
    <Section title="Theme">
      <SegmentedControl
        label="Theme"
        options={themeOptions}
        value={theme}
        disabled={!profile}
        onValueChange={(t) => void change(t)}
      />
      <p className="text-label text-muted">
        System follows your device. Your choice follows you to every device you log in on.
      </p>
    </Section>
  )
}

export function SettingsPage() {
  const profile = useProfile()
  const [leaving, setLeaving] = useState(false)

  async function logOut() {
    setLeaving(true)
    await supabase.auth.signOut()
    setLeaving(false)
  }

  return (
    <div className="flex min-h-dvh">
      <WorkspaceNav />
      <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 px-4 py-8 sm:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 self-start text-body font-semibold text-link hover:underline"
        >
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
          Your groups
        </Link>
        <h1 className="text-name font-medium tracking-tight">Settings</h1>
        {profile.isError && (
          <div className="flex flex-col items-start gap-2" role="alert">
            <p className="text-blocked">Could not load your profile.</p>
            <Button onClick={() => void profile.refetch()}>Retry</Button>
          </div>
        )}
        {/* Remount once the saved theme arrives so the control starts from it. */}
        <PhotoSection profile={profile.data} />
        <ThemeSection key={profile.data ? 'loaded' : 'loading'} profile={profile.data} />
        <Section title="Account">
          {profile.data && (
            <p className="text-body text-muted">Logged in as {profile.data.username}</p>
          )}
          <Button
            className="self-start"
            busy={leaving}
            busyLabel="Logging out…"
            onClick={() => void logOut()}
          >
            Log out
          </Button>
        </Section>
      </main>
    </div>
  )
}
