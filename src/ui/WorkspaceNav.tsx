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
        <img
          src="/icon-64.png"
          alt=""
          width="28"
          height="28"
          className="size-7 rounded-md object-cover shadow-xs"
        />
        <span>Taskahan</span>
      </Link>
      <nav aria-label="Workspace" className="flex flex-col gap-1">
        <span className="px-3 pb-1 text-label font-medium tracking-wider text-muted uppercase">
          Workspace
        </span>
        <NavLink to="/" end className="workspace-link">
          <LayoutGrid size={16} aria-hidden />
          Your groups
        </NavLink>
        {children ??
          (group && (
            <div className="mt-4 border-t border-line pt-4">
              <span className="block truncate px-3 pb-1.5 text-label font-medium tracking-wider text-muted uppercase">
                {group.name}
              </span>
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
        <div className="mt-4 border-t border-line pt-4">
          <NavLink to="/settings" className="workspace-link">
            <Settings size={16} aria-hidden />
            Settings
          </NavLink>
        </div>
      </nav>
      <p className="mt-auto px-3 text-label text-muted">A place for everyone’s part.</p>
    </aside>
  )
}
