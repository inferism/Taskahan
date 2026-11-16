import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { ToastProvider } from '@/ui'
import { ActivityHeartbeat } from './ActivityHeartbeat'
import { AuthProvider } from './auth'
import { ErrorBoundary } from './ErrorBoundary'
import { routes } from './router'

const router = createBrowserRouter(routes)

export function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <ActivityHeartbeat />
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
