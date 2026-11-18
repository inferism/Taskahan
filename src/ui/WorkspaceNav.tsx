import type { ReactNode } from 'react'
import { LayoutGrid, Settings } from 'lucide-react'
import { boardSections } from '@/features/board/sections'
import { NavLink, Link } from 'react-router'

import { useAuth } from '@/app/auth'
import { useGroups } from '@/features/home/api'

export function WorkspaceNav({ children }: { children?: ReactNode }) {
  const { session } = useAuth()
  const groups = useGroups()
  const last = session && sessionStorage.getItem(`taskahan.group.${session.user.id}`)
  const group = groups.data?.find((g) => g.id === last)
  return (
    <aside className="workspace-nav hidden lg:flex">
      <Link to="/" className="workspace-brand">
        Taskahan
      </Link>
      <nav aria-label="Workspace" className="flex flex-col gap-1">
        <NavLink to="/" end className="workspace-link">
          <LayoutGrid size={16} aria-hidden />
          Your groups
        </NavLink>
        {children ??
          (group && (
            <div className="mt-5 border-t border-line pt-5">
              {boardSections
                .filter((t) => t.value !== 'logs' || group.role === 'leader')
                .map(({ value, label, icon: Icon }) => (
                  <Link
                    key={value}
                    className="workspace-link"
                    to={`/g/${group.id}?section=${value}`}
                  >
                    <Icon size={18} aria-hidden />
                    {label}
                  </Link>
                ))}
            </div>
          ))}
        <NavLink to="/settings" className="workspace-link">
          <Settings size={16} aria-hidden />
          Settings
        </NavLink>
      </nav>
      <p className="mt-auto px-3 text-label text-muted">A place for everyone’s part.</p>
    </aside>
  )
}
