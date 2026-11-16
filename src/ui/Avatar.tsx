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
  /** Join-order seat number. Picks the colour and is shown as two digits. */
  seat: number
  name: string
  size?: 28 | 36 | 52
  photoUrl?: string | null
  online?: boolean
  former?: boolean
}

const sizeClass = { 28: 'size-7 text-label', 36: 'size-9 text-title', 52: 'size-[52px] text-name' }

/** The jersey tile. */
export function Avatar({ seat, name, size = 36, photoUrl, online, former }: AvatarProps) {
  const idx = (Math.max(seat, 1) - 1) % jerseys.length
  const num = String(seat).padStart(2, '0')
  const label = `${name}, number ${num}${former ? ', former member' : ''}${online ? ', online' : ''}`
  const photo = photoUrl && !former
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-md font-display font-bold',
        sizeClass[size],
        former ? 'border-2 border-dashed border-muted text-muted' : cn(jerseys[idx], 'text-white'),
      )}
    >
      {photo ? (
        <>
          <img src={photoUrl} alt="" className="size-full rounded-md object-cover" />
          <span
            aria-hidden
            className={cn(
              'absolute inset-x-0 bottom-0 rounded-b-md text-center text-label leading-4 text-white',
              jerseys[idx],
            )}
          >
            {num}
          </span>
        </>
      ) : (
        <span aria-hidden>{num}</span>
      )}
      {online && !former && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-surface bg-done"
        />
      )}
    </span>
  )
}
