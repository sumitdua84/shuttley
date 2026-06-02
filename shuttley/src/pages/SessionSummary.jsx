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
  const [editingMatchDate, setEditingMatchDate] = useState(null) // matchId
  const [editingDate, setEditingDate] = useState('')
  const [standingsExpanded, setStandingsExpanded] = useState(false)
  const [members, setMembers] = useState([])
  const [editingMatch, setEditingMatch] = useState(null)
  const [editTeam1, setEditTeam1] = useState([])
  const [editTeam2, setEditTeam2] = useState([])
  const [editScore1, setEditScore1] = useState('')
  const [editScore2, setEditScore2] = useState('')
  const [editLog, setEditLog] = useState([])
  const [myProfile, setMyProfile] = useState(null)

  useEffect(() => { fetchData() }, [sessionId])

  async function fetchData() {
    const [{ data: s }, { data: m }, { data: c }, { data: mem }, { data: mems }, { data: prof }] = await Promise.all([
      supabase.from('sessions').select('*, profiles(full_name)').eq('id', sessionId).single(),
      supabase.from('matches')
        .select('*, match_players(user_id, side, profiles(id, full_name))')
        .eq('session_id', sessionId)
        .order('played_at', { ascending: true }),
      supabase.from('clubs').select('name').eq('id', clubId).single(),
      supabase.from('memberships').select('role').eq('club_id', clubId).eq('user_id', user.id).single(),
      supabase.from('memberships').select('user_id, profiles(full_name)').eq('club_id', clubId).eq('status', 'approved'),
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
    ])
    setSession(s)
    setMatches(m || [])
    setClub(c)
    setIsModerator(mem?.role === 'moderator')
    setMembers((mems || []).filter(m => !m.is_guest))
    setMyProfile(prof)
    setLoading(false)

    // Fetch edit log for all matches in this session
    const matchIds = (m || []).map(x => x.id)
    if (matchIds.length > 0) {
      const { data: log } = await supabase
        .from('match_edit_log')
        .select('*, profiles(full_name)')
        .in('match_id', matchIds)
        .order('edited_at', { ascending: false })
      setEditLog(log || [])
    }
  }

  function startEditMatch(match) {
    setEditingMatch(match.id)
    setEditTeam1(match.match_players?.filter(p => p.side === 'team1').map(p => p.user_id) || [])
    setEditTeam2(match.match_players?.filter(p => p.side === 'team2').map(p => p.user_id) || [])
    setEditScore1(String(match.team1_score ?? ''))
    setEditScore2(String(match.team2_score ?? ''))
  }

  async function saveMatchEdit(match) {
    const s1 = parseInt(editScore1)
    const s2 = parseInt(editScore2)
    if (isNaN(s1) || isNaN(s2)) { showToast('Enter valid scores'); return }
    if (editTeam1.length === 0 || editTeam2.length === 0) { showToast('Select players for both teams'); return }
    const winnerSide = s1 > s2 ? 'team1' : s2 > s1 ? 'team2' : match.winner_side

    // Build human-readable change description for log
    const oldT1 = match.match_players?.filter(p => p.side === 'team1').map(p => p.profiles?.full_name?.split(' ')[0]).join(' & ')
    const oldT2 = match.match_players?.filter(p => p.side === 'team2').map(p => p.profiles?.full_name?.split(' ')[0]).join(' & ')
    const newT1 = editTeam1.map(uid => members.find(m => m.user_id === uid)?.profiles?.full_name?.split(' ')[0]).join(' & ')
    const newT2 = editTeam2.map(uid => members.find(m => m.user_id === uid)?.profiles?.full_name?.split(' ')[0]).join(' & ')

    const { error } = await supabase.from('matches')
      .update({ team1_score: s1, team2_score: s2, winner_side: winnerSide, status: 'confirmed' })
      .eq('id', match.id)
    if (error) { showToast('Error updating match'); return }

    await supabase.from('match_players').delete().eq('match_id', match.id)
    await supabase.from('match_players').insert([
      ...editTeam1.map(uid => ({ match_id: match.id, user_id: uid, side: 'team1' })),
      ...editTeam2.map(uid => ({ match_id: match.id, user_id: uid, side: 'team2' })),
    ])

    // Write to audit log
    await supabase.from('match_edit_log').insert({
      match_id: match.id,
      edited_by: user.id,
      old_score: `${match.team1_score}–${match.team2_score}`,
      new_score: `${s1}–${s2}`,
      old_players: `${oldT1} vs ${oldT2}`,
      new_players: `${newT1} vs ${newT2}`,
    })

    setEditingMatch(null)
    showToast('Match updated ✔')
    fetchData()
  }

  function togglePlayer(uid, team) {
    if (team === 1) {
      setEditTeam1(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
      setEditTeam2(prev => prev.filter(id => id !== uid))
    } else {
      setEditTeam2(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
      setEditTeam1(prev => prev.filter(id => id !== uid))
    }
  }

  async function confirmMatch(matchId) {
    const { error } = await supabase
      .from('matches')
      .update({ status: 'confirmed' })
      .eq('id', matchId)
    if (error) { showToast('Error confirming match'); return }
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

  async function updateMatchDate(matchId, date) {
    if (!date) return
    const { error } = await supabase
      .from('matches').update({ played_at: new Date(date).toISOString() }).eq('id', matchId)
    if (error) { showToast('Error updating date'); return }
    setEditingMatchDate(null)
    showToast('Date updated')
    fetchData()
  }

  async function deleteSession() {
    if (!confirm('Delete this session? This cannot be undone.')) return
    await supabase.from('rotation_matches').delete().eq('session_id', sessionId)
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
    if (error) { showToast('Error deleting session'); return }
    navigate(`/club/${clubId}/mod?tab=sessions`)
  }

  async function reopenSession() {
    const { data: active } = await supabase
      .from('sessions').select('id, name').eq('club_id', clubId).eq('status', 'active').maybeSingle()
    if (active && active.id !== sessionId) {
      showToast(`Close "${active.name}" first before reopening another`)
      return
    }
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'active', ended_at: null })
      .eq('id', sessionId)
    if (error) { showToast('Error reopening session'); return }
    showToast('Session reopened!')
    navigate(`/club/${clubId}/session/${sessionId}/rotation`)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
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

  const playerStats = calcStats().filter(p => p.wins + p.losses > 0)
  const mvp = playerStats[0]
  const duration = formatDuration(session.started_at, session.ended_at)
  const confirmedCount = matches.filter(m => m.status === 'confirmed').length

  return (
    <div className="page">
      <div className="topnav">
        <div style={{ width:40 }} />
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18 }}>Session Summary</span>
        <button onClick={() => navigate(`/club/${clubId}/member`)} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:13,fontWeight:500,padding:0 }}>Home</button>
      </div>

      <div className="content">

        {/* Header card */}
        <div style={{
          background:'linear-gradient(135deg, rgba(122,164,196,0.1) 0%, rgba(122,164,196,0.1) 100%)',
          border:'1px solid rgba(122,164,196,0.2)',
          borderRadius:'var(--radius)', padding:'20px', marginBottom:20,
          position:'relative', overflow:'hidden'
        }}>
          <div style={{ position:'absolute', right:-10, top:-10, fontSize:80, opacity:0.05, pointerEvents:'none' }}>🏸</div>
          <button onClick={() => navigate(`/club/${clubId}`)}
            style={{ background:'none',border:'none',padding:0,cursor:'pointer',fontSize:11,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',marginBottom:6,textAlign:'left' }}>
            {club?.name}
          </button>
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

        {/* Reopen / Delete banner — moderator only, ended sessions */}
        {isModerator && session.status === 'ended' && (
          <div style={{
            background:'rgba(122,164,196,0.06)', border:'1px solid rgba(122,164,196,0.2)',
            borderRadius:'var(--radius-sm)', padding:'12px 14px',
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
            marginBottom:20
          }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>Session ended</div>
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>Ended by mistake?</div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              {matches.length === 0 && (
                <button onClick={deleteSession} className="btn btn-danger btn-sm" style={{ whiteSpace:'nowrap' }}>
                  🗑 Delete
                </button>
              )}
              <button onClick={reopenSession} className="btn btn-primary btn-sm" style={{ whiteSpace:'nowrap' }}>
                ↩ Reopen
              </button>
            </div>
          </div>
        )}

        {/* MVP */}
        {mvp && mvp.wins > 0 && (
          <div style={{
            background:'var(--bg2)', border:'0.5px solid var(--border)',
            borderLeft:'4px solid #a07800',
            borderRadius:'var(--radius)', padding:'10px 16px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            marginBottom:16,
          }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>
                🏆 {shortName(mvp.name)}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                Session MVP · {mvp.wins}W{mvp.losses > 0 ? ` ${mvp.losses}L` : ''}
              </div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:'#a07800', background:'rgba(160,120,0,0.1)', borderRadius:99, padding:'3px 10px' }}>
              MVP
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
            if (i >= 3 && !standingsExpanded) return null
            return (
              <div key={p.id} style={{
                background:'var(--bg2)', border:'0.5px solid var(--border)',
                borderLeft:'4px solid var(--accent)',
                borderRadius:'var(--radius)', padding:'10px 16px',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                marginBottom:8,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:16, width:22, textAlign:'center', flexShrink:0 }}>
                    {i < 3 ? medals[i] : <span style={{ fontSize:12, color:'var(--text3)', fontWeight:600 }}>#{i+1}</span>}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>{shortName(p.name)}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{p.wins}W · {p.losses}L · {rate}%</div>
                  </div>
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>{p.wins} <span style={{ fontSize:10, fontWeight:400, color:'var(--text3)' }}>wins</span></div>
              </div>
            )
          })}
          {playerStats.length > 3 && (
            <button onClick={() => setStandingsExpanded(e => !e)} style={{
              width:'100%', padding:'8px', marginBottom:8,
              background:'transparent', border:'0.5px solid var(--border)',
              borderRadius:'var(--radius)', color:'var(--text3)',
              fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif",
            }}>
              {standingsExpanded ? 'Show less ▲' : `+${playerStats.length - 3} more ▼`}
            </button>
          )}
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
          const accentColor = match.status === 'disputed' ? '#ff5c5c' : match.status === 'pending' ? '#ffc832' : 'var(--accent)'
          return (
            <div key={match.id} style={{
              background:'var(--bg2)', border:'0.5px solid var(--border)',
              borderLeft:`4px solid ${accentColor}`,
              borderRadius:'var(--radius)', padding:'10px 16px',
              marginBottom:8,
            }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase' }}>
                  Match {idx + 1} · {match.type}
                </span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {match.status === 'pending' && <span style={{ fontSize:11, color:'#ffc832' }}>⏳ Pending</span>}
                  {match.status === 'disputed' && <span style={{ fontSize:11, color:'#ff5c5c' }}>⚠ Disputed</span>}
                  {match.status === 'confirmed' && <span style={{ fontSize:11, color:'var(--accent)' }}>✔</span>}
                  {isModerator && editingMatchDate !== match.id && editingMatch !== match.id && (
                    <>
                      <button onClick={() => startEditMatch(match)}
                        style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0 }}>
                        ✏️
                      </button>
                      <button onClick={() => { setEditingMatchDate(match.id); setEditingDate(match.played_at?.slice(0,10) || new Date().toISOString().slice(0,10)) }}
                        style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:11, padding:0 }}>
                        📅
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline date editor */}
              {isModerator && editingMatchDate === match.id && (
                <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8 }}>
                  <input type="date" value={editingDate}
                    max={new Date().toISOString().slice(0,10)}
                    onChange={e => setEditingDate(e.target.value)}
                    style={{ flex:1, background:'var(--bg3)', border:'0.5px solid var(--border2)', borderRadius:'var(--radius-sm)', padding:'5px 8px', color:'var(--text)', fontSize:12, outline:'none' }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => updateMatchDate(match.id, editingDate)}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingMatchDate(null)}>✕</button>
                </div>
              )}

              {/* Inline match editor */}
              {isModerator && editingMatch === match.id && (
                <div style={{ marginBottom:10 }}>
                  {/* Score inputs */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <input type="number" value={editScore1} onChange={e => setEditScore1(e.target.value)}
                      placeholder="T1" min="0" max="99"
                      style={{ width:56, textAlign:'center', background:'var(--bg3)', border:'0.5px solid var(--border2)', borderRadius:'var(--radius-sm)', padding:'6px 8px', color:'var(--text)', fontSize:16, fontWeight:700, outline:'none' }} />
                    <span style={{ color:'var(--text3)', fontWeight:700 }}>–</span>
                    <input type="number" value={editScore2} onChange={e => setEditScore2(e.target.value)}
                      placeholder="T2" min="0" max="99"
                      style={{ width:56, textAlign:'center', background:'var(--bg3)', border:'0.5px solid var(--border2)', borderRadius:'var(--radius-sm)', padding:'6px 8px', color:'var(--text)', fontSize:16, fontWeight:700, outline:'none' }} />
                  </div>
                  {/* Player selector */}
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
                    Tap to assign players
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
                    {members.map(m => {
                      const inT1 = editTeam1.includes(m.user_id)
                      const inT2 = editTeam2.includes(m.user_id)
                      return (
                        <div key={m.user_id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ flex:1, fontSize:13, color:'var(--text)', fontWeight: inT1||inT2 ? 600 : 400 }}>
                            {m.profiles?.full_name?.split(' ')[0]}
                          </div>
                          <button onClick={() => togglePlayer(m.user_id, 1)} style={{
                            padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', border:'none',
                            background: inT1 ? 'var(--accent)' : 'var(--bg3)',
                            color: inT1 ? '#fff' : 'var(--text3)',
                          }}>T1</button>
                          <button onClick={() => togglePlayer(m.user_id, 2)} style={{
                            padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', border:'none',
                            background: inT2 ? '#e05555' : 'var(--bg3)',
                            color: inT2 ? '#fff' : 'var(--text3)',
                          }}>T2</button>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-primary btn-sm" style={{ flex:1 }} onClick={() => saveMatchEdit(match)}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingMatch(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Score row */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: match.status === 'pending' && canAct ? 10 : 0 }}>
                <div style={{ flex:1 }}>
                  {t1.map(p => (
                    <div key={p.user_id} style={{
                      fontSize:13, fontWeight: t1Won ? 600 : 400,
                      color: t1Won ? 'var(--accent)' : 'var(--text2)'
                    }}>{shortName(p.profiles?.full_name)}</div>
                  ))}
                </div>
                <div style={{ textAlign:'center', minWidth:64 }}>
                  <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700 }}>
                    <span style={{ color: t1Won ? 'var(--accent)' : '#ff5c5c' }}>{match.team1_score}</span>
                    <span style={{ color:'var(--text3)', margin:'0 3px' }}>–</span>
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

        {/* Edit Changelog */}
        {editLog.length > 0 && (
          <>
            <hr className="divider" />
            <div className="section-label">📋 Edit History</div>
            {editLog.map(log => (
              <div key={log.id} style={{
                background:'var(--bg2)', border:'0.5px solid var(--border)',
                borderLeft:'3px solid var(--text3)',
                borderRadius:'var(--radius-sm)', padding:'10px 14px', marginBottom:8,
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                    {(() => { const idx = matches.findIndex(m => m.id === log.match_id); return `✏️ ${log.profiles?.full_name?.split(' ')[0]} edited Match ${idx >= 0 ? idx + 1 : '?'}` })()}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)', flexShrink:0 }}>
                    {new Date(log.edited_at).toLocaleString('en-AU', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit', hour12:true })}
                  </div>
                </div>
                {log.old_score !== log.new_score && (
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>
                    Score: <span style={{ color:'var(--danger)' }}>{log.old_score}</span> → <span style={{ color:'var(--success)' }}>{log.new_score}</span>
                  </div>
                )}
                {log.old_players !== log.new_players && (
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
                    Players: <span style={{ color:'var(--danger)' }}>{log.old_players}</span> → <span style={{ color:'var(--success)' }}>{log.new_players}</span>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

      </div>

      {/* Tab bar — mirrors the dashboard tab bar */}
      <div className="tabbar">
        {(isModerator
          ? [
              { id:'home',     label:'Home',     dest:`/club/${clubId}/mod?tab=home` },
              { id:'members',  label:'Members',  dest:`/club/${clubId}/mod?tab=members` },
              { id:'sessions', label:'Session',  dest:`/club/${clubId}/mod?tab=sessions` },
              { id:'settings', label:'Settings', dest:`/club/${clubId}/mod?tab=settings` },
            ]
          : [
              { id:'home',    label:'Home',    dest:`/club/${clubId}/member?tab=home` },
              { id:'members', label:'Members', dest:`/club/${clubId}/member?tab=members` },
            ]
        ).map(t => (
          <button key={t.id}
            className={`tab ${t.id === 'sessions' ? 'active' : ''}`}
            onClick={() => navigate(t.dest)}>
            <span style={{ fontWeight: t.id === 'sessions' ? 600 : 400 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
