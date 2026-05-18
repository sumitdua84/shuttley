import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function MemberDashboard() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [membership, setMembership] = useState(null)
  const [pendingMatches, setPendingMatches] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchData() }, [clubId, user])

  async function fetchData() {
    const { data: clubData } = await supabase.from('clubs').select('*').eq('id', clubId).single()
    setClub(clubData)

    const { data: mem } = await supabase.from('memberships').select('*')
      .eq('club_id', clubId).eq('user_id', user.id).single()
    setMembership(mem)

    if (mem?.status === 'approved') {
      // Fetch matches pending confirmation where current user is on the opposing team
      const { data: matchData } = await supabase
        .from('matches')
        .select('*, match_players(user_id, side, profiles(full_name))')
        .eq('club_id', clubId)
        .eq('status', 'pending')

      // Filter to matches where user is a player but NOT the one who recorded it
      const toConfirm = (matchData || []).filter(match => {
        const isPlayer = match.match_players?.some(p => p.user_id === user.id)
        const isRecorder = match.recorded_by === user.id
        return isPlayer && !isRecorder
      })
      setPendingMatches(toConfirm)
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'active')
      .maybeSingle()
    setActiveSession(session || null)

    setLoading(false)
  }

  async function confirmMatch(matchId) {
    const { error } = await supabase
      .from('matches')
      .update({ status: 'confirmed' })
      .eq('id', matchId)
    if (error) { console.error('confirmMatch error:', error); showToast(error.message || 'Error confirming match'); return }
    showToast('✔ Match confirmed!')
    fetchData()
  }

  async function disputeMatch(matchId) {
    const { error } = await supabase
      .from('matches')
      .update({ status: 'disputed' })
      .eq('id', matchId)
    if (error) { console.error('disputeMatch error:', error); showToast('Error disputing match'); return }
    showToast('⚠ Match disputed — moderator will review')
    fetchData()
  }

  function getTeamNames(match, side) {
    return match.match_players?.filter(p => p.side === side).map(p => p.profiles?.full_name || '?').join(' + ')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  if (loading) return <div className="splash"><div className="splash-logo">S</div></div>

  return (
    <div className="page">
      <div className="topnav">
        <button onClick={() => navigate('/')} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:22,padding:0 }}>←</button>
        <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:18 }}>{club?.name}</span>
        <button onClick={() => navigate('/')} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:20,padding:0 }}>🏠</button>
      </div>

      <div className="content">
        {membership?.status === 'pending' && (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ fontSize:48, marginBottom:20 }}>⏳</div>
            <h2 style={{ fontSize:24, marginBottom:10 }}>Pending approval</h2>
            <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.6 }}>
              Your request to join <strong>{club?.name}</strong> is waiting for the moderator to approve you.
              You'll be able to access the club once approved.
            </p>
          </div>
        )}

        {membership?.status === 'approved' && <>

          {/* Pending confirmations */}
          {pendingMatches.length > 0 && <>
            <div className="section-label" style={{ color:'#ffc832' }}>
              ⏳ Awaiting your confirmation ({pendingMatches.length})
            </div>
            {pendingMatches.map(match => {
              const team1Won = match.winner_side === 'team1'
              return (
                <div key={match.id} className="card" style={{ marginBottom:12, border:'1px solid rgba(255,200,50,0.3)' }}>
                  <div style={{ fontSize:11, color:'#ffc832', fontWeight:600, marginBottom:8, textTransform:'uppercase' }}>
                    Confirm this result?
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight: team1Won ? 600 : 400 }}>{getTeamNames(match, 'team1')}</div>
                      {team1Won && <div style={{ fontSize:11, color:'var(--accent)' }}>🏅 Winner</div>}
                    </div>
                    <div style={{ textAlign:'center', minWidth:60 }}>
                      <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700 }}>
                        {match.team1_score} – {match.team2_score}
                      </div>
                    </div>
                    <div style={{ flex:1, textAlign:'right' }}>
                      <div style={{ fontSize:14, fontWeight: !team1Won ? 600 : 400 }}>{getTeamNames(match, 'team2')}</div>
                      {!team1Won && <div style={{ fontSize:11, color:'#ff5c5c' }}>🏅 Winner</div>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                      onClick={() => confirmMatch(match.id)}>
                      ✔ Confirm
                    </button>
                    <button className="btn btn-danger btn-sm" style={{ flex:1 }}
                      onClick={() => disputeMatch(match.id)}>
                      ✕ Dispute
                    </button>
                  </div>
                </div>
              )
            })}
            <hr className="divider" />
          </>}

          {/* Active session banner */}
          {activeSession && (
            <div style={{
              background:'rgba(100,210,120,0.08)', border:'1px solid rgba(100,210,120,0.25)',
              borderRadius:'var(--radius)', padding:'12px 16px', marginBottom:16
            }}>
              <div style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginBottom:2 }}>● SESSION IN PROGRESS</div>
              <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>{activeSession.name}</div>
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>Anyone can record scores — no need to be in the match</div>
            </div>
          )}

          {/* Main actions */}
          <div style={{ marginBottom:24 }}>
            <h2 style={{ fontSize:26, marginBottom:16 }}>Welcome back 🏸</h2>
            <button className="btn btn-primary" style={{ width:'100%', marginBottom:10 }}
              onClick={() => navigate(`/club/${clubId}/record`)}>
              + Record a Match
            </button>
            <button className="btn btn-secondary" style={{ width:'100%' }}
              onClick={() => navigate(`/club/${clubId}/matches`)}>
              🏅 View Matches & Leaderboard
            </button>
          </div>

        </>}

        {membership?.status === 'rejected' && (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ fontSize:48, marginBottom:20 }}>❌</div>
            <h2 style={{ fontSize:24, marginBottom:10 }}>Request declined</h2>
            <p style={{ color:'var(--text2)', fontSize:14 }}>Your request to join was not approved.</p>
            <button className="btn btn-ghost" style={{ marginTop:24 }} onClick={() => navigate('/')}>
              Go back home
            </button>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
