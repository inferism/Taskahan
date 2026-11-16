import { Navigate, type RouteObject } from 'react-router'
import { Gallery } from '@/ui/Gallery'
import { AuthGuard, GuestOnly } from './AuthGuard'
import { RouteError } from './ErrorBoundary'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { HomePage } from '@/features/home/HomePage'
import { BoardPage, SettingsPage } from './pages'

const appRoutes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  {
    element: <AuthGuard />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/g/:groupId', element: <BoardPage /> },
      { path: '/g/:groupId/t/:number', element: <BoardPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  ...(import.meta.env.DEV ? [{ path: '/dev/ui', element: <Gallery /> }] : []),
  { path: '*', element: <Navigate to="/" replace /> },
]

/** Every route sits under one error element so a screen crash shows the recovery screen. */
export function withErrorElement(children: RouteObject[]): RouteObject[] {
  return [{ errorElement: <RouteError />, children }]
}

export const routes = withErrorElement(appRoutes)
