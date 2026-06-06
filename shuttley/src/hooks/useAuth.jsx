import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingDeletion, setPendingDeletion] = useState(false)

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

    // Check for pending deletion request
    const { data: delReq } = await supabase
      .from('account_deletion_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()
    if (delReq) {
      setPendingDeletion(true)
      setProfile(data)
      setLoading(false)
      return
    }

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

    setPendingDeletion(false)
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

  async function signInWithApple() {
    const isIOSApp = /PWAShell/.test(navigator.userAgent)
    if (isIOSApp) {
      const { data } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: 'com.googleusercontent.apps.9950019459-rf4sunsd8q5741qf81sfiorhatp5v9rs://oauth2redirect',
          skipBrowserRedirect: true,
        }
      })
      if (data?.url) {
        window.webkit?.messageHandlers?.['oauth-start']?.postMessage(data.url)
      }
    } else {
      await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: `${window.location.origin}/auth/callback` } })
    }
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
    <AuthContext.Provider value={{ user, profile, loading, pendingDeletion, signInWithGoogle, signInWithApple, signUpWithEmail, signInWithEmail, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
