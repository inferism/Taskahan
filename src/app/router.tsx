import { Navigate, type RouteObject } from 'react-router'
import { Gallery } from '@/ui/Gallery'
import { AuthGuard, GuestOnly } from './AuthGuard'
import { BoardPage, HomePage, LoginPage, SettingsPage, SignupPage } from './pages'

export const routes: RouteObject[] = [
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
