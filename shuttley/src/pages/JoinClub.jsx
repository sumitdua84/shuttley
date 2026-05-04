import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function JoinClub() {
  const { inviteCode } = useParams()
  const { user, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [status, setStatus] = useState('loading') // loading | found | joining | done | error

  useEffect(() => {
    supabase.from('clubs')
      .select('*, profiles!clubs_created_by_fkey(full_name)')
      .eq('invite_code', inviteCode)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setStatus('error')
        else { setClub(data); setStatus('found') }
      })
  }, [inviteCode])

  async function joinClub() {
    if (!user) { signInWithGoogle(); return }
    setStatus('joining')
    const { data: existing } = await supabase.from('memberships')
      .select('id,status').eq('user_id', user.id).eq('club_id', club.id).single()
    if (existing) {
      if (existing.status === 'approved') navigate(`/club/${club.id}/member`)
      else navigate('/')
      return
    }
    await supabase.from('memberships').insert({
      user_id: user.id, club_id: club.id, role: 'member', status: 'pending'
    })
    setStatus('done')
    setTimeout(() => navigate('/'), 2000)
  }

  return (
    <div style={{ minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px',background:'var(--bg)' }}>
      <div style={{ fontFamily:"'DM Serif Display',serif",fontSize:22,color:'var(--accent)',marginBottom:40 }}>Shuttley</div>

      {status === 'loading' && <div style={{ color:'var(--text2)' }}>Loading…</div>}

      {status === 'error' && (
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48,marginBottom:16 }}>🚫</div>
          <h2 style={{ fontSize:24,marginBottom:8 }}>Invalid link</h2>
          <p style={{ color:'var(--text2)',fontSize:14 }}>This invite link is no longer valid.</p>
          <button className="btn btn-ghost" style={{ marginTop:24 }} onClick={() => navigate('/')}>Go home</button>
        </div>
      )}

      {(status === 'found' || status === 'joining') && club && (
        <div style={{ textAlign:'center',width:'100%' }}>
          <div style={{ fontSize:48,marginBottom:16 }}>🏸</div>
          <h2 style={{ fontSize:28,marginBottom:6 }}>You're invited!</h2>
          <p style={{ color:'var(--text2)',fontSize:14,marginBottom:32 }}>
            {club.profiles?.full_name} invited you to join
          </p>
          <div className="card" style={{ marginBottom:24,textAlign:'left' }}>
            <div style={{ fontWeight:600,fontSize:20,marginBottom:4 }}>{club.name}</div>
            {club.description && <div style={{ color:'var(--text2)',fontSize:14 }}>{club.description}</div>}
          </div>
          <button className="btn btn-primary" onClick={joinClub} disabled={status==='joining'}>
            {!user ? 'Sign in to join' : status==='joining' ? 'Sending request…' : 'Request to join'}
          </button>
          <p style={{ color:'var(--text3)',fontSize:12,marginTop:12 }}>
            Your request will be reviewed by the moderator
          </p>
        </div>
      )}

      {status === 'done' && (
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48,marginBottom:16 }}>✅</div>
          <h2 style={{ fontSize:24,marginBottom:8 }}>Request sent!</h2>
          <p style={{ color:'var(--text2)',fontSize:14 }}>The moderator will review your request shortly.</p>
        </div>
      )}
    </div>
  )
}
