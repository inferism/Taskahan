export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked'

// eslint-disable-next-line react-refresh/only-export-components
export const statusLabel: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
}

/**
 * The product's own status shapes. Never colour alone: each status has its own shape.
 * `animate` plays the arrival: Done pops and draws its check, In progress sweeps its half in.
 */
export function StatusGlyph({
  status,
  size = 20,
  animate,
}: {
  status: TaskStatus
  size?: number
  animate?: boolean
}) {
  const common = {
    className: animate ? 'glyph-pop shrink-0' : 'shrink-0',
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    role: 'img' as const,
    'aria-label': statusLabel[status],
  }
  switch (status) {
    case 'done':
      return (
        <svg {...common}>
          <circle className="glyph-ring" cx="10" cy="10" r="9" fill="var(--done)" />
          <path
            className="glyph-tick"
            d="M5.5 10.5l3 3 6-6.5"
            fill="none"
            stroke="var(--on-status)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'in_progress':
      return (
        <svg {...common}>
          <circle
            className="glyph-ring"
            cx="10"
            cy="10"
            r="9"
            fill="var(--surface)"
            stroke="var(--ink)"
            strokeWidth="2"
          />
          <path className="glyph-half" d="M10 1a9 9 0 0 1 0 18z" fill="var(--scoreboard-yellow)" />
          <circle cx="10" cy="10" r="9" fill="none" stroke="var(--ink)" strokeWidth="2" />
        </svg>
      )
    case 'blocked':
      return (
        <svg {...common}>
          <rect
            className="glyph-ring"
            x="1"
            y="1"
            width="18"
            height="18"
            rx="4"
            fill="var(--blocked)"
          />
          <text
            x="10"
            y="14.5"
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="var(--on-status)"
            fontFamily="Geist, system-ui, sans-serif"
          >
            ?
          </text>
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle
            className="glyph-ring"
            cx="10"
            cy="10"
            r="9"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="2"
          />
        </svg>
      )
  }
}
