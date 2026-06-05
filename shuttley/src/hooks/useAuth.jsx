import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()

    if (!data?.full_name) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const metaName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name
      if (metaName) {
        await supabase.from('profiles').upsert({ id: userId, full_name: metaName })
        setProfile({ ...data, id: userId, full_name: metaName })
        setLoading(false)
        return
      }
    }

    setProfile(data)
    setLoading(false)
  }

  async function signInWithGoogle() {
    const isIOSApp = /PWAShell/.test(navigator.userAgent)
    const redirectTo = isIOSApp
      ? 'com.googleusercontent.apps.9950019459-rf4sunsd8q5741qf81sfiorhatp5v9rs://oauth2redirect'
      : `${window.location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } })
  }

  async function signUpWithEmail(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    return { data, error }
  }

  async function signInWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`
    })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
