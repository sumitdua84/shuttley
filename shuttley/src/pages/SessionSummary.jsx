import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function SessionSummary() {
  const { clubId, sessionId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [matches, setMatches] = useState([])
  const [club, setClub] = useState(null)
  const [isModerator, setIsModerator] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchData() }, [sessionId])

  async function fetchData() {
    const [{ data: s }, { data: m }, { data: c }, { data: mem }] = await Promise.all([
      supabase.from('sessions').select('*, profiles(full_name)').eq('id', sessionId).single(),
      supabase.from('matches')
        .select('*, match_players(user_id, side, profiles(id, full_name))')
        .eq('session_id', sessionId)
        .order('played_at', { ascending: true }),
      supabase.from('clubs').select('name').eq('id', clubId).single(),
      supabase.from('memberships').select('role').eq('club_id', clubId).eq('user_id', user.id).single()
    ])
    setSession(s)
    setMatches(m || [])
    setClub(c)
    setIsModerator(mem?.role === 'moderator')
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
    if (error) { showToast('Error disputing match'); return }
    showToast('⚠ Match disputed')
    fetchData()
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  function formatDuration(start, end) {
    if (!start || !end) return null
    const mins = Math.round((new Date(end) - new Date(start)) / 60000)
    if (mins < 60) return `${mins} min`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  function shortName(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length === 1) return parts[0]
    return `${parts[0]} ${parts[parts.length - 1][0]}`
  }

  function calcStats() {
    const stats = {}
    matches.filter(m => m.status === 'confirmed').forEach(match => {
      ['team1', 'team2'].forEach(side => {
        const players = match.match_players?.filter(p => p.side === side) || []
        const won = match.winner_side === side
        players.forEach(p => {
          if (!stats[p.user_id]) stats[p.user_id] = {
            id: p.user_id, name: p.profiles?.full_name, wins: 0, losses: 0
          }
          if (won) stats[p.user_id].wins++
          else stats[p.user_id].losses++
        })
      })
    })
    return Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses)
  }

  if (loading) return <div className="splash"><div className="splash-logo">S</div></div>
  if (!session) return (
    <div className="page"><div className="content"><p style={{ color:'var(--text2)' }}>Session not found.</p></div></div>
  )

  const playerStats = calcStats()
  const mvp = playerStats[0]
  const duration = formatDuration(session.started_at, session.ended_at)
  const confirmedCount = matches.filter(m => m.status === 'confirmed').length

  return (
    <div className="page">
      <div className="topnav">
        <button onClick={() => navigate(`/club/${clubId}/matches`)}
          style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:22,padding:0 }}>←</button>
        <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:18 }}>Session Summary</span>
        <button onClick={() => navigate('/')} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:20,padding:0 }}>🏠</button>
      </div>

      <div className="content">

        {/* Header card */}
        <div style={{
          background:'linear-gradient(135deg, rgba(100,210,120,0.1) 0%, rgba(50,150,220,0.1) 100%)',
          border:'1px solid rgba(100,210,120,0.2)',
          borderRadius:'var(--radius)', padding:'20px', marginBottom:20,
          position:'relative', overflow:'hidden'
        }}>
          <div style={{ position:'absolute', right:-10, top:-10, fontSize:80, opacity:0.05, pointerEvents:'none' }}>🏸</div>
          <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', marginBottom:6 }}>
            {club?.name}
          </div>
          <h2 style={{ fontSize:26, marginBottom:8, letterSpacing:'-0.5px' }}>{session.name}</h2>
          <div style={{ display:'flex', gap:16, fontSize:13, color:'var(--text2)', flexWrap:'wrap' }}>
            <span>📅 {new Date(session.started_at).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })}</span>
            {duration && <span>⏱ {duration}</span>}
            <span>🏸 {matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
            {confirmedCount < matches.length && (
              <span style={{ color:'#ffc832' }}>⏳ {matches.length - confirmedCount} pending</span>
            )}
          </div>
        </div>

        {/* MVP */}
        {mvp && mvp.wins > 0 && (
          <div className="card" style={{
            marginBottom:16, textAlign:'center',
            background:'rgba(255,200,50,0.05)', border:'1px solid rgba(255,200,50,0.2)'
          }}>
            <div style={{ fontSize:36, marginBottom:6 }}>🏆</div>
            <div style={{ fontSize:24, fontWeight:700, color:'var(--accent)' }}>{shortName(mvp.name)}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginTop:4 }}>
              Session MVP · {mvp.wins}W {mvp.losses > 0 ? `${mvp.losses}L` : ''}
            </div>
          </div>
        )}

        {/* Player standings */}
        {playerStats.length > 0 && <>
          <div className="section-label">Player Standings</div>
          {playerStats.map((p, i) => {
            const total = p.wins + p.losses
            const rate = total > 0 ? Math.round(p.wins / total * 100) : 0
            const medals = ['🥇','🥈','🥉']
            return (
              <div key={p.id} className="card" style={{ marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:18, width:28, textAlign:'center' }}>
                    {i < 3 ? medals[i] : <span style={{ fontSize:13, color:'var(--text3)', fontWeight:600 }}>#{i+1}</span>}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:15 }}>{shortName(p.name)}</div>
                    <div style={{ fontSize:12, color:'var(--text2)' }}>{p.wins}W · {p.losses}L · {rate}%</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:22, fontWeight:700, color:'var(--accent)' }}>{p.wins}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>wins</div>
                  </div>
                </div>
                <div style={{ marginTop:8, height:3, borderRadius:99, background:'var(--bg3)', overflow:'hidden' }}>
                  <div style={{ width:`${rate}%`, height:'100%', background:'var(--accent)', borderRadius:99 }}/>
                </div>
              </div>
            )
          })}
          <hr className="divider" />
        </>}

        {/* All matches */}
        <div className="section-label">All Matches</div>
        {matches.length === 0 ? (
          <div className="empty"><p>No matches recorded this session.</p></div>
        ) : matches.map((match, idx) => {
          const t1 = match.match_players?.filter(p => p.side === 'team1') || []
          const t2 = match.match_players?.filter(p => p.side === 'team2') || []
          const t1Won = match.winner_side === 'team1'
          const userIsPlayer = match.match_players?.some(p => p.user_id === user.id)
          const canAct = isModerator || userIsPlayer
          return (
            <div key={match.id} className="card" style={{ marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase' }}>
                  Match {idx + 1} · {match.type}
                </span>
                {match.status === 'pending' && <span style={{ fontSize:11, color:'#ffc832' }}>⏳ Pending</span>}
                {match.status === 'disputed' && <span style={{ fontSize:11, color:'#ff5c5c' }}>⚠ Disputed</span>}
                {match.status === 'confirmed' && <span style={{ fontSize:11, color:'var(--accent)' }}>✔ Confirmed</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: match.status === 'pending' && canAct ? 10 : 0 }}>
                <div style={{ flex:1 }}>
                  {t1.map(p => (
                    <div key={p.user_id} style={{
                      fontSize:13, fontWeight: t1Won ? 600 : 400,
                      color: t1Won ? 'var(--accent)' : 'var(--text2)'
                    }}>{shortName(p.profiles?.full_name)}</div>
                  ))}
                </div>
                <div style={{ textAlign:'center', minWidth:70 }}>
                  <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700 }}>
                    <span style={{ color: t1Won ? 'var(--accent)' : '#ff5c5c' }}>{match.team1_score}</span>
                    <span style={{ color:'var(--text3)', margin:'0 4px' }}>–</span>
                    <span style={{ color: !t1Won ? 'var(--accent)' : '#ff5c5c' }}>{match.team2_score}</span>
                  </div>
                </div>
                <div style={{ flex:1, textAlign:'right' }}>
                  {t2.map(p => (
                    <div key={p.user_id} style={{
                      fontSize:13, fontWeight: !t1Won ? 600 : 400,
                      color: !t1Won ? 'var(--accent)' : 'var(--text2)'
                    }}>{shortName(p.profiles?.full_name)}</div>
                  ))}
                </div>
              </div>
              {match.status === 'pending' && canAct && (
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                    onClick={() => confirmMatch(match.id)}>✔ Confirm</button>
                  <button className="btn btn-danger btn-sm" style={{ flex:1 }}
                    onClick={() => disputeMatch(match.id)}>✕ Dispute</button>
                </div>
              )}
            </div>
          )
        })}

      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
