import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth'

/** Wraps routes that need a signed-in user. Unauthenticated visitors go to /login. */
export function AuthGuard() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="min-h-screen bg-ground" aria-busy="true" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** For /login and /signup: signed-in users go Home instead. */
export function GuestOnly() {
  const { session, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-ground" aria-busy="true" />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}
