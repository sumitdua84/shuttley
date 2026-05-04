import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function ClubPage() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    supabase.from('memberships').select('role,status')
      .eq('club_id', clubId).eq('user_id', user.id).single()
      .then(({ data }) => {
        if (!data) navigate('/')
        else if (data.role === 'moderator' && data.status === 'approved') navigate(`/club/${clubId}/mod`, { replace: true })
        else navigate(`/club/${clubId}/member`, { replace: true })
      })
  }, [clubId, user])

  return <div className="splash"><div className="splash-logo">S</div></div>
}
