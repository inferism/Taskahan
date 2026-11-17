import { useAuth } from './auth'
import { HomePage } from '@/features/home/HomePage'
import { LandingPage } from '@/features/landing/LandingPage'

export function StartPage() {
  const { session, loading } = useAuth()
  if (loading) return <div className="min-h-dvh bg-ground" aria-busy="true" />
  return session ? <HomePage /> : <LandingPage />
}
