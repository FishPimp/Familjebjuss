import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Home, Profile } from './types'

interface AuthState {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, loading: false })
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') qc.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
export const useUserId = () => useAuth().session?.user.id ?? null

/** Min profil och mitt hem (hemmet kan bara jag själv läsa). */
export function useMe() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['me', uid],
    enabled: !!uid,
    queryFn: async () => {
      const [{ data: profile, error: pErr }, { data: homes, error: hErr }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid!).maybeSingle(),
        supabase.rpc('get_my_home'),
      ])
      if (pErr) throw pErr
      if (hErr) throw hErr
      return { profile: profile as Profile | null, home: ((homes as Home[] | null) ?? [])[0] ?? null }
    },
  })
}
