import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { generateSchedule, generateRebalancedSchedule, generateMatchesForNewPlayer, reorderPendingMatches } from '../utils/scheduleGenerator'

export default function RotationPage() {
  const { clubId, sessionId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [rotationMatches, setRotationMatches] = useState([])
  const [sessionMatches, setSessionMatches] = useState([])
  const [profiles, setProfiles] = useState({})
  const [allMembers, setAllMembers] = useState([])
  const [isModerator, setIsModerator] = useState(false)
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState({})
  const [submitting, setSubmitting] = useState({})
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [toast, setToast] = useState('')
  const [viewRound, setViewRound] = useState(0) // 0-based index into rounds array

  useEffect(() => { fetchData() }, [sessionId])

  // Auto-jump to the round containing the first pending match
  useEffect(() => {
    if (rotationMatches.length === 0) return
    const roundSize = 5
    const firstPendingIdx = rotationMatches.findIndex(m => m.status === 'pending')
    if (firstPendingIdx === -1) return
    setViewRound(Math.floor(firstPendingIdx / roundSize))
  }, [rotationMatches])

  async function fetchData() {
    const [{ data: s }, { data: rm }, { data: mem }, { data: mems }, { data: sm }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('rotation_matches')
        .select('*')
        .eq('session_id', sessionId)
        .neq('status', 'removed')
        .order('seq'),
      supabase.from('memberships').select('role').eq('club_id', clubId).eq('user_id', user.id).single(),
      supabase.from('memberships').select('*, profiles(id, full_name)').eq('club_id', clubId).eq('status', 'approved'),
      supabase.from('matches')
        .select('*, match_players(user_id, side, profiles(id, full_name))')
        .eq('session_id', sessionId)
        .order('played_at', { ascending: true })
    ])

    setSession(s)
    setRotationMatches(rm || [])
    setSessionMatches(sm || [])
    setIsModerator(mem?.role === 'moderator')
    setAllMembers(mems || [])

    // Collect all relevant profile IDs
    const ids = new Set()
    ;(rm || []).forEach(m => [m.p1, m.p2, m.p3, m.p4].filter(Boolean).forEach(id => ids.add(id)))
    ;(s?.rotation_player_ids || []).forEach(id => ids.add(id))
    ;(mems || []).forEach(m => m.profiles?.id && ids.add(m.profiles.id))

    if (ids.size > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', [...ids])
      const map = {}
      ;(profs || []).forEach(p => { map[p.id] = p })
      setProfiles(map)
    }

    setLoading(false)
  }

  function shortName(id) {
    if (!id) return ''
    const full = profiles[id]?.full_name
    if (!full) return '?'
    const parts = full.trim().split(' ')
    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}`
  }

  function setScore(matchId, field, val) {
    setScores(prev => ({ ...prev, [matchId]: { ...prev[matchId], [field]: val } }))
  }

  async function submitMatch(rm) {
    const s1 = parseInt(scores[rm.id]?.s1 ?? '0')
    const s2 = parseInt(scores[rm.id]?.s2 ?? '0')
    if (s1 === s2) { showToast('Scores must be different'); return }

    setSubmitting(prev => ({ ...prev, [rm.id]: true }))

    const playerEntries = [
      { user_id: rm.p1, side: 'team1' },
      rm.p2 && { user_id: rm.p2, side: 'team1' },
      { user_id: rm.p3, side: 'team2' },
      rm.p4 && { user_id: rm.p4, side: 'team2' },
    ].filter(Boolean)

    const { data: match, error: matchErr } = await supabase.from('matches').insert({
      club_id: clubId,
      session_id: sessionId,
      type: session.match_type === 'singles' ? 'singles' : 'doubles',
      team1_score: s1,
      team2_score: s2,
      winner_side: s1 > s2 ? 'team1' : 'team2',
      status: 'confirmed',
      recorded_by: user.id,
      played_at: new Date().toISOString()
    }).select().single()

    if (matchErr) {
      showToast('Error saving match')
      setSubmitting(prev => ({ ...prev, [rm.id]: false }))
      return
    }

    await supabase.from('match_players').insert(playerEntries.map(p => ({ ...p, match_id: match.id })))

    await supabase.from('rotation_matches').update({
      status: 'submitted', score1: s1, score2: s2, match_id: match.id
    }).eq('id', rm.id)

    setSubmitting(prev => ({ ...prev, [rm.id]: false }))
    showToast('✔ Match recorded!')
    fetchData()
  }

  async function removePlayer(playerId) {
    if (!confirm(`Remove ${shortName(playerId)} from rotation? Their pending matches will be cancelled.`)) return

    const newIds = (session.rotation_player_ids || []).filter(id => id !== playerId)
    await supabase.from('sessions').update({ rotation_player_ids: newIds }).eq('id', sessionId)

    const toRemove = rotationMatches
      .filter(m => m.status === 'pending' && [m.p1, m.p2, m.p3, m.p4].includes(playerId))
      .map(m => m.id)
    if (toRemove.length > 0) {
      await supabase.from('rotation_matches').update({ status: 'removed' }).in('id', toRemove)
    }

    showToast(`${shortName(playerId)} removed — tap Rebalance to update the schedule`)
    fetchData()
  }

  async function rebalance() {
    if (!confirm('Rebalance will replace all pending matches with a fresh schedule for the current players, keeping all submitted results. Continue?')) return

    // Remove all pending matches
    const pendingIds = rotationMatches.filter(m => m.status === 'pending').map(m => m.id)
    if (pendingIds.length > 0) {
      await supabase.from('rotation_matches').update({ status: 'removed' }).in('id', pendingIds)
    }

    // Generate new schedule based on submitted matches
    const submittedMatches = rotationMatches.filter(m => m.status === 'submitted')
    const currentPlayers = session.rotation_player_ids || []
    const newMatches = generateRebalancedSchedule(currentPlayers, session.match_type, submittedMatches)

    if (newMatches.length > 0) {
      const maxSeq = rotationMatches.reduce((mx, r) => Math.max(mx, r.seq), 0)
      await supabase.from('rotation_matches').insert(
        newMatches.map((m, i) => ({ ...m, session_id: sessionId, club_id: clubId, seq: maxSeq + i + 1, status: 'pending' }))
      )
      showToast(`Schedule rebalanced — ${newMatches.length} matches remaining`)
    } else {
      showToast('All pairs already played — start a new cycle!')
    }
    fetchData()
  }

  // Free play: just toggle player in session without generating matches
  async function toggleSessionPlayer(profileId) {
    const isAdded = currentPlayers.includes(profileId)
    const newIds = isAdded
      ? currentPlayers.filter(id => id !== profileId)
      : [...currentPlayers, profileId]
    await supabase.from('sessions').update({ rotation_player_ids: newIds }).eq('id', sessionId)
    fetchData()
  }

  async function addPlayer(profileId) {
    const newIds = [...(session.rotation_player_ids || []), profileId]
    await supabase.from('sessions').update({ rotation_player_ids: newIds }).eq('id', sessionId)

    const newMatches = generateMatchesForNewPlayer(profileId, newIds, rotationMatches, session.match_type)
    if (newMatches.length > 0) {
      const maxSeq = rotationMatches.reduce((mx, r) => Math.max(mx, r.seq), 0)
      await supabase.from('rotation_matches').insert(
        newMatches.map((m, i) => ({ ...m, session_id: sessionId, club_id: clubId, seq: maxSeq + i + 1, status: 'pending' }))
      )
    }

    setShowAddPlayer(false)

    // Re-fetch then reorder all pending matches for fair interleaving
    const { data: allMatches } = await supabase
      .from('rotation_matches').select('*').eq('session_id', sessionId).neq('status', 'removed').order('seq')

    if (allMatches) {
      const currentPending = allMatches.filter(m => m.status === 'pending')
      const currentSubmitted = allMatches.filter(m => m.status === 'submitted')
      const reordered = reorderPendingMatches(currentPending, currentSubmitted)
      // Update seq numbers in batch
      const minSeq = currentSubmitted.reduce((mx, r) => Math.max(mx, r.seq), 0) + 1
      await Promise.all(reordered.map((m, i) =>
        supabase.from('rotation_matches').update({ seq: minSeq + i }).eq('id', m.id)
      ))
    }

    showToast(`${profiles[profileId]?.full_name || 'Player'} added!`)
    fetchData()
  }

  async function endSession() {
    if (pending.length > 0) {
      const word = pending.length === 1 ? '1 match is' : `${pending.length} matches are`
      if (!confirm(`${word} still pending. End session anyway?`)) return
    }
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (error) { alert('Error ending session: ' + error.message); return }
    navigate(`/club/${clubId}/session/${sessionId}`)
  }

  async function newCycle() {
    const pending = rotationMatches.filter(m => m.status === 'pending')
    if (pending.length > 0) {
      if (!confirm(`${pending.length} match${pending.length !== 1 ? 'es' : ''} still pending. Start new cycle anyway?`)) return
    }
    const players = session.rotation_player_ids || []
    if (players.length < 2) { showToast('Not enough players'); return }

    const newMatches = generateSchedule(players, session.match_type)
    const maxSeq = rotationMatches.reduce((mx, r) => Math.max(mx, r.seq), 0)
    await supabase.from('rotation_matches').insert(
      newMatches.map((m, i) => ({ ...m, session_id: sessionId, club_id: clubId, seq: maxSeq + i + 1, status: 'pending' }))
    )
    showToast('New cycle started!')
    fetchData()
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  if (loading) return <div className="splash"><div className="splash-logo">S</div></div>
  if (!session) return (
    <div className="page"><div className="content"><p style={{ color: 'var(--text2)' }}>Session not found.</p></div></div>
  )

  const isActive = session.status === 'active'
  const currentPlayers = session.rotation_player_ids || []
  const pending = rotationMatches.filter(m => m.status === 'pending')
  const submitted = rotationMatches.filter(m => m.status === 'submitted')
  const total = pending.length + submitted.length
  const pct = total > 0 ? Math.round(submitted.length / total * 100) : 0
  const availableToAdd = allMembers
    .filter(m => m.profiles && !currentPlayers.includes(m.profiles.id))
    .map(m => m.profiles)

  return (
    <div className="page">
      <div className="topnav">
        <div style={{ width: 40 }} />
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18 }}>{session.name}</span>
        <button onClick={() => navigate(`/club/${clubId}/member`)}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>Home</button>
      </div>

      <div className="content">

        {/* Progress header — rotation only */}
        {rotationMatches.length > 0 && (
          <div style={{
            background: 'rgba(122,164,196,0.06)', border: '1px solid rgba(122,164,196,0.2)',
            borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: isActive ? 'var(--accent)' : 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                  {isActive ? '● Live' : 'Ended'} · {session.match_type === 'singles' ? 'Singles' : 'Doubles'}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {submitted.length} <span style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 400 }}>/ {total} matches</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)' }}>{pct}%</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>done</div>
              </div>
            </div>
            {total > 0 && (
              <div style={{ height: 4, borderRadius: 99, background: 'var(--bg3)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width 0.4s' }} />
              </div>
            )}
          </div>
        )}

        {/* Free play status pill */}
        {rotationMatches.length === 0 && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: isActive ? 'var(--accent)' : 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>
              {isActive ? '● Live' : 'Ended'} · Free Play · {session.match_type === 'singles' ? 'Singles' : 'Doubles'}
            </span>
          </div>
        )}

        {/* Players section — rotation mode only */}
        {rotationMatches.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
              Players ({currentPlayers.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {currentPlayers.map(id => (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'var(--bg3)', borderRadius: 99, padding: '5px 10px', fontSize: 13
                }}>
                  <span>{shortName(id)}</span>
                  {isModerator && isActive && (
                    <button onClick={() => removePlayer(id)} style={{
                      background: 'none', border: 'none', color: 'var(--text3)',
                      cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, marginTop: 1
                    }}>✕</button>
                  )}
                </div>
              ))}
              {isModerator && isActive && (
                <button onClick={() => setShowAddPlayer(!showAddPlayer)} style={{
                  background: 'rgba(122,164,196,0.1)', border: '1px dashed rgba(122,164,196,0.4)',
                  borderRadius: 99, padding: '5px 12px', fontSize: 13, color: 'var(--accent)',
                  cursor: 'pointer'
                }}>+ Add</button>
              )}
            </div>
            {showAddPlayer && (
              <div className="card" style={{ marginTop: 8 }}>
                {availableToAdd.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>No more members to add</div>
                ) : <>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Select player to add:</div>
                  {availableToAdd.map(p => (
                    <button key={p.id} onClick={() => addPlayer(p.id)} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', padding: '9px 4px',
                      fontSize: 14, color: 'var(--text)', cursor: 'pointer',
                      borderBottom: '1px solid var(--bg3)'
                    }}>{p.full_name}</button>
                  ))}
                </>}
              </div>
            )}
          </div>
        )}

        {/* Match list — paginated rounds */}
        {rotationMatches.length === 0 ? (
          <div>
            {/* Header + Record button */}
            <div style={{ textAlign:'center', padding:'24px 0 20px' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🏸</div>
              <div style={{ fontSize:16, fontWeight:600, marginBottom:4 }}>Free Play</div>
              <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>
                Record matches as you play them.
              </div>
              {isActive && (
                <button className="btn btn-primary" onClick={() => navigate(`/club/${clubId}/record`, { state: { returnTo: `/club/${clubId}/session/${sessionId}/rotation`, matchType: session.match_type } })}>
                  + Record a Match
                </button>
              )}
            </div>

            {/* Session match list */}
            {sessionMatches.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize:11, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', marginBottom:8 }}>
                  This Session · {sessionMatches.length} match{sessionMatches.length !== 1 ? 'es' : ''}
                </div>
                {sessionMatches.map((match, idx) => {
                  const matchNum = `M${idx + 1}`
                  const t1 = match.match_players?.filter(p => p.side === 'team1') || []
                  const t2 = match.match_players?.filter(p => p.side === 'team2') || []
                  const t1Won = match.winner_side === 'team1'
                  const t1Names = t1.map(p => {
                    const full = p.profiles?.full_name || '?'
                    const parts = full.trim().split(' ')
                    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length-1][0]}`
                  }).join(' / ')
                  const t2Names = t2.map(p => {
                    const full = p.profiles?.full_name || '?'
                    const parts = full.trim().split(' ')
                    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length-1][0]}`
                  }).join(' / ')
                  return (
                    <div key={match.id} style={{
                      display:'flex', alignItems:'center', gap:8,
                      padding:'9px 10px', marginBottom:4,
                      background:'var(--bg2)', border:'0.5px solid var(--border)',
                      borderRadius:'var(--radius-sm)'
                    }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', flexShrink:0, width:24 }}>{matchNum}</div>
                      <div style={{ flex:1, fontSize:13, fontWeight: t1Won ? 600 : 400, color: t1Won ? 'var(--text)' : 'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {t1Names}
                      </div>
                      <div style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, flexShrink:0 }}>
                        <span style={{ color: t1Won ? 'var(--accent)' : '#ff5c5c' }}>{match.team1_score}</span>
                        <span style={{ color:'var(--text3)', margin:'0 3px' }}>–</span>
                        <span style={{ color: !t1Won ? 'var(--accent)' : '#ff5c5c' }}>{match.team2_score}</span>
                      </div>
                      <div style={{ flex:1, fontSize:13, fontWeight: !t1Won ? 600 : 400, color: !t1Won ? 'var(--text)' : 'var(--text2)', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {t2Names}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (() => {
          const roundSize = 5
          const rounds = []
          for (let i = 0; i < rotationMatches.length; i += roundSize)
            rounds.push(rotationMatches.slice(i, i + roundSize))

          const totalRounds = rounds.length
          const safeRound = Math.min(viewRound, totalRounds - 1)
          const roundMatches = rounds[safeRound] || []

          // Which round index has the first pending match (the "active" round)
          const activeRoundIdx = Math.floor(
            rotationMatches.findIndex(m => m.status === 'pending') / roundSize
          )
          const isActiveRound = safeRound === activeRoundIdx

          return <>
            {/* Round header with prev/next */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button
                onClick={() => setViewRound(r => Math.max(0, r - 1))}
                disabled={safeRound === 0}
                style={{
                  background: 'none', border: 'none', fontSize: 22, cursor: safeRound === 0 ? 'default' : 'pointer',
                  color: safeRound === 0 ? 'var(--text3)' : 'var(--text2)', padding: '4px 8px'
                }}>‹</button>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  Round {safeRound + 1}
                  {isActiveRound && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginLeft: 6 }}>● NOW</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                  {safeRound + 1} of {totalRounds}
                </div>
              </div>

              <button
                onClick={() => setViewRound(r => Math.min(totalRounds - 1, r + 1))}
                disabled={safeRound === totalRounds - 1}
                style={{
                  background: 'none', border: 'none', fontSize: 22, cursor: safeRound === totalRounds - 1 ? 'default' : 'pointer',
                  color: safeRound === totalRounds - 1 ? 'var(--text3)' : 'var(--text2)', padding: '4px 8px'
                }}>›</button>
            </div>

            {/* Round dot indicators */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
              {rounds.map((_, idx) => (
                <div key={idx} onClick={() => setViewRound(idx)} style={{
                  width: idx === safeRound ? 18 : 6, height: 6, borderRadius: 99, cursor: 'pointer',
                  background: idx === safeRound ? 'var(--accent)' : idx === activeRoundIdx ? 'rgba(122,164,196,0.4)' : 'var(--bg3)',
                  transition: 'all 0.2s'
                }} />
              ))}
            </div>

            {/* Matches for this round */}
            {roundMatches.map(rm => {
              const isDone = rm.status === 'submitted'
              const showInputs = isActive && !isDone
              const sc = scores[rm.id] || {}
              const s1Val = sc.s1 ?? '0'
              const s2Val = sc.s2 ?? '0'
              const canSubmit = parseInt(s1Val) !== parseInt(s2Val)
              const t1Won = isDone && rm.score1 > rm.score2
              const t1Name = shortName(rm.p1) + (rm.p2 ? ` / ${shortName(rm.p2)}` : '')
              const t2Name = shortName(rm.p3) + (rm.p4 ? ` / ${shortName(rm.p4)}` : '')

              return (
                <div key={rm.id} style={{
                  padding: '9px 12px', marginBottom: 6,
                  background: 'var(--bg2)', border: `0.5px solid ${isDone ? 'var(--border)' : 'var(--border2)'}`,
                  borderRadius: 'var(--radius-sm)',
                  opacity: isDone ? 0.55 : 1, transition: 'opacity 0.3s'
                }}>
                  {/* Teams row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showInputs ? 10 : 0 }}>
                    <div style={{
                      flex: 1, fontSize: 13, fontWeight: isDone && t1Won ? 600 : 400,
                      color: isDone && t1Won ? 'var(--text)' : 'var(--text2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{t1Name}</div>

                    <div style={{ flexShrink: 0, minWidth: 52, textAlign: 'center' }}>
                      {isDone ? (
                        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <span style={{ color: t1Won ? 'var(--accent)' : '#ff5c5c' }}>{rm.score1}</span>
                          <span style={{ color: 'var(--text3)', margin: '0 3px' }}>–</span>
                          <span style={{ color: !t1Won ? 'var(--accent)' : '#ff5c5c' }}>{rm.score2}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>VS</span>
                      )}
                    </div>

                    <div style={{
                      flex: 1, fontSize: 13, fontWeight: isDone && !t1Won ? 600 : 400,
                      color: isDone && !t1Won ? 'var(--text)' : 'var(--text2)',
                      textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{t2Name}</div>
                  </div>

                  {/* Score steppers */}
                  {showInputs && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Team 1 stepper */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <button onClick={() => setScore(rm.id, 's1', String(Math.max(0, (parseInt(s1Val) || 0) - 1)))}
                          style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer', padding: '7px 10px', fontWeight: 700, lineHeight: 1 }}>‹</button>
                        <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 22, textAlign: 'center' }}>{s1Val}</span>
                        <button onClick={() => setScore(rm.id, 's1', String((parseInt(s1Val) || 0) + 1))}
                          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 18, cursor: 'pointer', padding: '7px 10px', fontWeight: 700, lineHeight: 1 }}>›</button>
                      </div>

                      <span style={{ color: 'var(--text3)', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>–</span>

                      {/* Team 2 stepper */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg3)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <button onClick={() => setScore(rm.id, 's2', String(Math.max(0, (parseInt(s2Val) || 0) - 1)))}
                          style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer', padding: '7px 10px', fontWeight: 700, lineHeight: 1 }}>‹</button>
                        <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 22, textAlign: 'center' }}>{s2Val}</span>
                        <button onClick={() => setScore(rm.id, 's2', String((parseInt(s2Val) || 0) + 1))}
                          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 18, cursor: 'pointer', padding: '7px 10px', fontWeight: 700, lineHeight: 1 }}>›</button>
                      </div>

                      <button className="btn btn-primary"
                        style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, opacity: canSubmit ? 1 : 0.35, flexShrink: 0, borderRadius: 'var(--radius-sm)', width: 'auto', height: 'auto' }}
                        disabled={!canSubmit || submitting[rm.id]}
                        onClick={() => submitMatch(rm)}>
                        {submitting[rm.id] ? '…' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        })()}

        {/* Footer actions */}
        {isActive && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rotationMatches.length > 0 && <>
              <button className="btn btn-secondary" onClick={() => navigate(`/club/${clubId}/record`, { state: { returnTo: `/club/${clubId}/session/${sessionId}/rotation`, matchType: session.match_type } })}>
                Custom Match
              </button>
              <button className="btn btn-ghost" onClick={newCycle}>
                New Cycle
              </button>
              {isModerator && (
                <button className="btn btn-ghost" onClick={rebalance}>
                  Rebalance
                </button>
              )}
            </>}
            <button className="btn btn-danger" onClick={endSession}>
              End Session
            </button>
          </div>
        )}

      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
