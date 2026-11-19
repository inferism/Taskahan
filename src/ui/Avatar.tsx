import { useEffect, useState } from 'react'
import { cn } from './cn'

const jerseys = [
  'bg-jersey-royal',
  'bg-jersey-rust',
  'bg-jersey-violet',
  'bg-jersey-teal',
  'bg-jersey-magenta',
  'bg-jersey-graphite',
  'bg-jersey-steel',
  'bg-jersey-brown',
]

export interface AvatarProps {
  /** Join-order seat number. Picks the color and remains in the accessible label. */
  seat: number
  name: string
  size?: 28 | 36 | 52
  photoUrl?: string | null
  online?: boolean
  former?: boolean
}

const sizeClass = { 28: 'size-7 text-label', 36: 'size-9 text-title', 52: 'size-[52px] text-name' }

/** Stable seat colors identify people even without a profile photo. */
export function Avatar({ seat, name, size = 36, photoUrl, online, former }: AvatarProps) {
  const idx = (Math.max(seat, 1) - 1) % jerseys.length
  const num = String(seat).padStart(2, '0')
  const label = `${name}, number ${num}${former ? ', former member' : ''}${online ? ', online' : ''}`
  const photo = photoUrl && !former
  // Pulse only when someone comes online while the avatar is already on screen, so the first
  // presence sync after a page load does not set every avatar pulsing at once.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 2000)
    return () => clearTimeout(t)
  }, [])
  const [seenOnline, setSeenOnline] = useState(online)
  const [ping, setPing] = useState(0)
  if (online !== seenOnline) {
    setSeenOnline(online)
    if (online && settled) setPing(ping + 1)
  }
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full font-medium',
        sizeClass[size],
        former
          ? 'border border-dashed border-muted text-muted'
          : cn(jerseys[idx], 'text-(--avatar-ink)'),
      )}
    >
      {photo ? (
        <img src={photoUrl} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span aria-hidden>{name.slice(0, 2).toUpperCase()}</span>
      )}
      {online && !former && (
        <span
          key={ping}
          aria-hidden
          className={cn(
            'presence-dot absolute -top-1 -right-1 size-3 rounded-full border-2 border-surface bg-done',
            ping > 0 && 'ping',
          )}
        />
      )}
    </span>
  )
}
