import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Check if user was trying to join a club via invite link
        const pendingInviteCode = localStorage.getItem('pendingInviteCode')
        if (pendingInviteCode) {
          localStorage.removeItem('pendingInviteCode')
          navigate(`/join/${pendingInviteCode}`, { replace: true })
        } else {
          navigate('/', { replace: true })
        }
      } else {
        navigate('/login', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="splash">
      <div className="splash-logo">S</div>
    </div>
  )
}
