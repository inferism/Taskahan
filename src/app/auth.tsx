import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  /** True until the stored session has been read once. */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // The account the cached data belongs to; undefined until the stored session is read.
  const owner = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    /** Every cache holds one account's private data; a different account starts empty. */
    const accept = (next: Session | null) => {
      const userId = next?.user.id ?? null
      if (owner.current !== undefined && owner.current !== userId) queryClient.clear()
      owner.current = userId
      setSession(next)
      setLoading(false)
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (active) accept(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => accept(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  const value = useMemo(() => ({ session, loading }), [session, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
