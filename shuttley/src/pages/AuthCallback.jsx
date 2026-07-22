import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getNotificationPermissionStatus } from '../hooks/usePushNotifications'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    function handleSession(session) {
      if (getNotificationPermissionStatus() === 'default') {
        localStorage.setItem('promptNotifications', '1')
      }
      const pendingInviteCode = localStorage.getItem('pendingInviteCode')
      if (pendingInviteCode) {
        localStorage.removeItem('pendingInviteCode')
        navigate(`/join/${pendingInviteCode}`, { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    }

    // Listen for auth state changes to handle async PKCE code exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handleSession(session)
    })

    // Also check for an existing session (covers the non-PKCE / already-exchanged case)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleSession(session)
      // Don't redirect to /login here — onAuthStateChange will fire if sign-in is still in progress
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  return (
    <div className="splash">
      <div className="splash-logo">S</div>
    </div>
  )
}
