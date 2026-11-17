import type { ReactNode } from 'react'
import { LayoutGrid, Settings } from 'lucide-react'
import { NavLink, Link } from 'react-router'

export function WorkspaceNav({ children }: { children?: ReactNode }) {
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
        {children}
        <NavLink to="/settings" className="workspace-link">
          <Settings size={16} aria-hidden />
          Settings
        </NavLink>
      </nav>
      <p className="mt-auto px-3 text-label text-muted">A place for everyone’s part.</p>
    </aside>
  )
}
