import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function RecordMatch() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [isModerator, setIsModerator] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [type, setType] = useState('singles')
  const [team1, setTeam1] = useState([])
  const [team2, setTeam2] = useState([])
  const [score1, setScore1] = useState('')
  const [score2, setScore2] = useState('')
  const [requireConfirmation, setRequireConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [step, setStep] = useState(1)

  useEffect(() => { fetchMembers() }, [clubId])

  async function fetchMembers() {
    const { data } = await supabase
      .from('memberships')
      .select('user_id, role, profiles(id, full_name, avatar_url)')
      .eq('club_id', clubId)
      .eq('status', 'approved')
    const myMembership = (data || []).find(m => m.user_id === user.id)
    setIsModerator(myMembership?.role === 'moderator')
    setMembers((data || []).map(m => m.profiles).filter(Boolean))

    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'active')
      .maybeSingle()
    setActiveSession(session || null)
  }

  function togglePlayer(side, memberId) {
    const maxSize = type === 'singles' ? 1 : 2
    if (side === 'team1') {
      if (team1.includes(memberId)) {
        setTeam1(team1.filter(id => id !== memberId))
      } else if (team1.length < maxSize && !team2.includes(memberId)) {
        setTeam1([...team1, memberId])
      }
    } else {
      if (team2.includes(memberId)) {
        setTeam2(team2.filter(id => id !== memberId))
      } else if (team2.length < maxSize && !team1.includes(memberId)) {
        setTeam2([...team2, memberId])
      }
    }
  }

  function getPlayerName(id) {
    return members.find(m => m.id === id)?.full_name || 'Unknown'
  }

  const maxPlayers = type === 'singles' ? 1 : 2
  const allSelectedPlayers = [...team1, ...team2]

  const userIsInMatch = allSelectedPlayers.includes(user.id)
  const playersReady = team1.length === maxPlayers && team2.length === maxPlayers
  const sessionActive = !!activeSession
  const canProceed = playersReady && (userIsInMatch || isModerator || sessionActive)
  const scoreReady = score1 !== '' && score2 !== '' && score1 !== score2

  async function submitMatch() {
    if (!scoreReady || (!userIsInMatch && !isModerator && !sessionActive)) return
    setSubmitting(true)

    const s1 = parseInt(score1)
    const s2 = parseInt(score2)
    const winner_side = s1 > s2 ? 'team1' : 'team2'

    const { data: match, error } = await supabase
      .from('matches')
      .insert({
        club_id: clubId,
        type,
        team1_score: s1,
        team2_score: s2,
        winner_side,
        recorded_by: user.id,
        status: requireConfirmation ? 'pending' : 'confirmed',
        confirmed_by: requireConfirmation ? null : user.id,
        session_id: activeSession?.id || null
      })
      .select().single()

    if (error) { showToast('Error saving match'); setSubmitting(false); return }

    const players = [
      ...team1.map(id => ({ match_id: match.id, user_id: id, side: 'team1' })),
      ...team2.map(id => ({ match_id: match.id, user_id: id, side: 'team2' }))
    ]
    await supabase.from('match_players').insert(players)

    setSubmitting(false)
    navigate(`/club/${clubId}/matches`, { state: { success: true } })
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  return (
    <div className="page">
      <div className="topnav">
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)}
          style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:22,padding:0 }}>←</button>
        <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:18 }}>Record Match</span>
        <button onClick={() => navigate('/')} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:20,padding:0 }}>🏠</button>
      </div>

      {/* Step indicator */}
      <div style={{ display:'flex', gap:6, padding:'16px 20px 0' }}>
        {[1,2,3].map(s => (
          <div key={s} style={{
            flex:1, height:3, borderRadius:99,
            background: s <= step ? 'var(--accent)' : 'var(--bg3)',
            transition:'background 0.2s'
          }}/>
        ))}
      </div>

      <div className="content">

        {/* Step 1 — Match type */}
        {step === 1 && <>
          <h2 style={{ fontSize:26, marginBottom:6 }}>Match type</h2>
          <p style={{ color:'var(--text2)', fontSize:14, marginBottom:28 }}>Singles or doubles?</p>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {['singles','doubles'].map(t => (
              <div key={t} onClick={() => setType(t)}
                style={{
                  padding:'20px', borderRadius:'var(--radius)',
                  border: `1.5px solid ${type===t ? 'var(--accent)' : 'var(--border2)'}`,
                  background: type===t ? 'var(--accent-dim)' : 'var(--bg2)',
                  cursor:'pointer', transition:'all 0.15s'
                }}>
                <div style={{ fontSize:32, marginBottom:8 }}>{t==='singles'?'🏸':'🏸🏸'}</div>
                <div style={{ fontWeight:500, fontSize:16, color: type===t ? 'var(--accent)' : 'var(--text)', textTransform:'capitalize' }}>{t}</div>
                <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>
                  {t==='singles' ? '1 player vs 1 player' : '2 players vs 2 players'}
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-primary" style={{ marginTop:28 }} onClick={() => setStep(2)}>
            Next →
          </button>
        </>}

        {/* Step 2 — Select players */}
        {step === 2 && <>
          <h2 style={{ fontSize:26, marginBottom:6 }}>Select players</h2>
          <p style={{ color:'var(--text2)', fontSize:14, marginBottom:8 }}>
            {type === 'singles' ? 'Pick 1 player per side' : 'Pick 2 players per side'}
          </p>

          {/* Session active banner */}
          {sessionActive && (
            <div style={{ background:'rgba(100,210,120,0.08)', border:'1px solid rgba(100,210,120,0.25)', borderRadius:'var(--radius-sm)', padding:'10px 14px', marginBottom:16, fontSize:13, color:'var(--accent)' }}>
              ● Session in progress — anyone can record any match
            </div>
          )}
          {/* You must be in the match notice — hidden for moderators and during sessions */}
          {!isModerator && !sessionActive && (
            <div style={{ background:'rgba(255,200,50,0.1)', border:'1px solid rgba(255,200,50,0.3)', borderRadius:'var(--radius-sm)', padding:'10px 14px', marginBottom:16, fontSize:13, color:'#ffc832' }}>
              ⚠ You must be one of the players to record this match
            </div>
          )}

          {/* Team labels */}
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            {['Team 1','Team 2'].map((label, i) => {
              const team = i === 0 ? team1 : team2
              return (
                <div key={label} style={{
                  flex:1, background:'var(--bg2)', border:`0.5px solid ${i===0?'var(--accent)':'#ff5c5c'}`,
                  borderRadius:'var(--radius)', padding:'10px 12px'
                }}>
                  <div style={{ fontSize:11, color: i===0?'var(--accent)':'#ff5c5c', fontWeight:600, marginBottom:4 }}>{label}</div>
                  {team.length === 0
                    ? <div style={{ fontSize:12, color:'var(--text3)' }}>No players yet</div>
                    : team.map(id => <div key={id} style={{ fontSize:13, color:'var(--text)' }}>{getPlayerName(id)}</div>)
                  }
                </div>
              )
            })}
          </div>

          {/* Player list */}
          <div className="section-label">Tap to assign</div>
          {members.map(m => {
            const inTeam1 = team1.includes(m.id)
            const inTeam2 = team2.includes(m.id)
            const isCurrentUser = m.id === user.id
            return (
              <div key={m.id} style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'10px 0', borderBottom:'0.5px solid var(--border)'
              }}>
                <div className="member-avatar">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt="" />
                    : <div className="member-avatar-init">{(m.full_name||'?')[0]}</div>
                  }
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{m.full_name}</div>
                  {isCurrentUser && <div style={{ fontSize:11, color:'var(--accent)' }}>You</div>}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => togglePlayer('team1', m.id)}
                    style={{
                      padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600,
                      border: `1.5px solid ${inTeam1 ? 'var(--accent)' : 'var(--border2)'}`,
                      background: inTeam1 ? 'var(--accent-dim)' : 'transparent',
                      color: inTeam1 ? 'var(--accent)' : 'var(--text2)', cursor:'pointer'
                    }}>T1</button>
                  <button onClick={() => togglePlayer('team2', m.id)}
                    style={{
                      padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600,
                      border: `1.5px solid ${inTeam2 ? '#ff5c5c' : 'var(--border2)'}`,
                      background: inTeam2 ? 'rgba(255,92,92,0.1)' : 'transparent',
                      color: inTeam2 ? '#ff5c5c' : 'var(--text2)', cursor:'pointer'
                    }}>T2</button>
                </div>
              </div>
            )
          })}

          {playersReady && !userIsInMatch && !isModerator && !sessionActive && (
            <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(255,92,92,0.1)', border:'1px solid rgba(255,92,92,0.3)', borderRadius:'var(--radius-sm)', fontSize:13, color:'#ff5c5c' }}>
              ✕ You must be one of the selected players to record this match
            </div>
          )}

          <button className="btn btn-primary"
            onClick={() => setStep(3)}
            disabled={!canProceed}
            style={{ marginTop:24, opacity: canProceed ? 1 : 0.4 }}>
            Next →
          </button>
        </>}

        {/* Step 3 — Enter score */}
        {step === 3 && <>
          <h2 style={{ fontSize:26, marginBottom:6 }}>Enter score</h2>
          <p style={{ color:'var(--text2)', fontSize:14, marginBottom:24 }}>What was the final score?</p>

          {/* Match summary */}
          <div className="card" style={{ marginBottom:24, textAlign:'center' }}>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>
              {type === 'singles' ? 'Singles' : 'Doubles'}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ flex:1 }}>
                {team1.map(id => <div key={id} style={{ fontSize:14, fontWeight:500 }}>{getPlayerName(id)}</div>)}
              </div>
              <div style={{ fontSize:13, color:'var(--text3)' }}>vs</div>
              <div style={{ flex:1, textAlign:'right' }}>
                {team2.map(id => <div key={id} style={{ fontSize:14, fontWeight:500 }}>{getPlayerName(id)}</div>)}
              </div>
            </div>
          </div>

          {/* Score inputs */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:'var(--accent)', fontWeight:600, marginBottom:8, textAlign:'center' }}>
                {team1.map(id => getPlayerName(id)).join(' + ')}
              </div>
              <input
                type="number" min="0" max="100"
                value={score1}
                onChange={e => setScore1(e.target.value)}
                placeholder="0"
                style={{
                  width:'100%', background:'var(--bg3)',
                  border:`2px solid ${score1 && parseInt(score1) > parseInt(score2||0) ? 'var(--accent)' : 'var(--border2)'}`,
                  borderRadius:'var(--radius)', padding:'20px',
                  color:'var(--text)', fontSize:36, fontWeight:700,
                  textAlign:'center', outline:'none', fontFamily:"'DM Sans',sans-serif"
                }}
              />
            </div>
            <div style={{ fontSize:24, color:'var(--text3)', fontWeight:300, paddingTop:32 }}>–</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:'#ff5c5c', fontWeight:600, marginBottom:8, textAlign:'center' }}>
                {team2.map(id => getPlayerName(id)).join(' + ')}
              </div>
              <input
                type="number" min="0" max="100"
                value={score2}
                onChange={e => setScore2(e.target.value)}
                placeholder="0"
                style={{
                  width:'100%', background:'var(--bg3)',
                  border:`2px solid ${score2 && parseInt(score2) > parseInt(score1||0) ? '#ff5c5c' : 'var(--border2)'}`,
                  borderRadius:'var(--radius)', padding:'20px',
                  color:'var(--text)', fontSize:36, fontWeight:700,
                  textAlign:'center', outline:'none', fontFamily:"'DM Sans',sans-serif"
                }}
              />
            </div>
          </div>

          {score1 !== '' && score2 !== '' && score1 === score2 && (
            <p style={{ color:'#ffc832', fontSize:13, textAlign:'center', marginBottom:12 }}>
              Scores can't be equal — there must be a winner!
            </p>
          )}

          {score1 !== '' && score2 !== '' && score1 !== score2 && (
            <div style={{ textAlign:'center', padding:'12px 0', color:'var(--text2)', fontSize:14, marginBottom:8 }}>
              🏅 Winner: <strong style={{ color:'var(--accent)' }}>
                {parseInt(score1) > parseInt(score2)
                  ? team1.map(id => getPlayerName(id)).join(' + ')
                  : team2.map(id => getPlayerName(id)).join(' + ')
                }
              </strong>
            </div>
          )}

          {/* Confirmation toggle */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            background:'var(--bg2)', borderRadius:'var(--radius-sm)',
            padding:'12px 14px', marginBottom:16
          }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>
                {requireConfirmation ? '⏳ Requires confirmation' : '✔ Auto-confirm'}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                {requireConfirmation ? 'Opponent must approve before it counts' : 'Score counts immediately'}
              </div>
            </div>
            <div
              onClick={() => setRequireConfirmation(r => !r)}
              style={{
                width:44, height:26, borderRadius:99, cursor:'pointer',
                background: requireConfirmation ? 'var(--border2)' : 'var(--accent)',
                position:'relative', transition:'background 0.2s', flexShrink:0
              }}>
              <div style={{
                position:'absolute', top:3,
                left: requireConfirmation ? 3 : 19,
                width:20, height:20, borderRadius:99,
                background:'#fff', transition:'left 0.2s'
              }}/>
            </div>
          </div>

          <button className="btn btn-primary" onClick={submitMatch}
            disabled={!scoreReady || submitting}
            style={{ marginTop:8, opacity: scoreReady && !submitting ? 1 : 0.4 }}>
            {submitting ? 'Saving…' : requireConfirmation ? '⏳ Submit for Confirmation' : '✔ Submit Score'}
          </button>
        </>}

      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
