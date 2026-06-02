import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function RecordMatch() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.returnTo
  const sessionMatchType = location.state?.matchType

  const initialStep = sessionMatchType ? 2 : 1

  const [members, setMembers] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [type, setType] = useState(
    sessionMatchType === 'singles' ? 'singles' : 'doubles'
  )
  // slots[0..1] = Team 1, slots[2..3] = Team 2 (doubles)
  // slots[0]    = Team 1, slots[1]    = Team 2 (singles)
  const [slots, setSlots] = useState([null, null, null, null])
  const [score1, setScore1] = useState('')
  const [score2, setScore2] = useState('')
  const [requireConfirmation, setRequireConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [step, setStep] = useState(initialStep)
  const startStep = initialStep

  // Derived
  const maxSlots   = type === 'singles' ? 2 : 4
  const halfSlots  = maxSlots / 2
  const team1      = slots.slice(0, halfSlots).filter(Boolean)
  const team2      = slots.slice(halfSlots, maxSlots).filter(Boolean)
  const playersReady = team1.length === halfSlots && team2.length === halfSlots
  const scoreReady   = score1 !== '' && score2 !== '' && score1 !== score2

  // Reset slots & score when match type changes
  useEffect(() => {
    setSlots([null, null, null, null])
    setScore1('')
    setScore2('')
  }, [type])

  useEffect(() => { fetchMembers() }, [clubId])

  async function fetchMembers() {
    const { data } = await supabase
      .from('memberships')
      .select('user_id, role, profiles(id, full_name, avatar_url)')
      .eq('club_id', clubId)
      .eq('status', 'approved')
    setMembers((data || []).map(m => m.profiles).filter(Boolean))

    const { data: session } = await supabase
      .from('sessions').select('*').eq('club_id', clubId).eq('status', 'active').maybeSingle()
    setActiveSession(session || null)
  }

  function getPlayerName(id) {
    const full = members.find(m => m.id === id)?.full_name || 'Unknown'
    return full.split(' ')[0]   // first name only for compact display
  }

  function handlePlayerTap(playerId) {
    // Place into first empty slot within maxSlots
    const emptyIdx = slots.findIndex((s, i) => s === null && i < maxSlots)
    if (emptyIdx === -1) return
    const n = [...slots]
    n[emptyIdx] = playerId
    setSlots(n)
  }

  function removeFromSlot(idx) {
    const n = [...slots]
    n[idx] = null
    setSlots(n)
  }

  const selectedIds    = slots.slice(0, maxSlots).filter(Boolean)
  const sortedMembers  = [...members].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

  async function submitMatch() {
    if (!scoreReady || !playersReady) return
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
        session_id: activeSession?.id || null,
        played_at: new Date().toISOString()
      })
      .select().single()

    if (error) { showToast('Error saving match'); setSubmitting(false); return }

    await supabase.from('match_players').insert([
      ...team1.map(id => ({ match_id: match.id, user_id: id, side: 'team1' })),
      ...team2.map(id => ({ match_id: match.id, user_id: id, side: 'team2' })),
    ])

    setSubmitting(false)
    if (returnTo) {
      navigate(returnTo)
    } else if (activeSession) {
      navigate(`/club/${clubId}/session/${activeSession.id}/rotation`)
    } else {
      navigate(`/club/${clubId}/matches`, { state: { success: true } })
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ── Slot chip ──────────────────────────────────────────────────────────────
  function SlotChip({ slotIdx, teamColor }) {
    const pid  = slots[slotIdx]
    const name = pid ? getPlayerName(pid) : null
    const filled = !!pid
    return (
      <div
        onClick={() => filled && removeFromSlot(slotIdx)}
        style={{
          flex: 1, minHeight: 58,
          borderRadius: 'var(--radius-sm)',
          border: `1.5px ${filled ? `solid ${teamColor}` : 'dashed var(--border2)'}`,
          background: filled
            ? teamColor === 'var(--accent)' ? 'var(--accent-dim)' : 'rgba(224,85,85,0.08)'
            : 'var(--bg3)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor: filled ? 'pointer' : 'default',
          padding: '6px 4px',
          transition: 'all 0.15s',
          userSelect: 'none',
        }}>
        {filled ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: teamColor, textAlign: 'center', lineHeight: 1.2 }}>
              {name}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3, letterSpacing: '0.03em' }}>tap to remove</div>
          </>
        ) : (
          <div style={{ fontSize: 22, color: 'var(--border2)', lineHeight: 1 }}>+</div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topnav">
        <button
          onClick={() => step > startStep ? setStep(step - 1) : navigate(`/club/${clubId}/member`)}
          style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:22,padding:0 }}>←</button>
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18 }}>Record Match</span>
        <button onClick={() => navigate(`/club/${clubId}/member`)}
          style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:13,fontWeight:500,padding:0 }}>Home</button>
      </div>

      {/* Step indicator */}
      <div style={{ display:'flex', gap:6, padding:'16px 20px 0' }}>
        {[1, 2].filter(s => s >= startStep).map(s => (
          <div key={s} style={{
            flex:1, height:3, borderRadius:99,
            background: s <= step ? 'var(--accent)' : 'var(--bg3)',
            transition: 'background 0.2s'
          }}/>
        ))}
      </div>

      <div className="content">

        {/* ── Step 1 — Match type ── */}
        {step === 1 && <>
          <h2 style={{ fontSize:26, marginBottom:6 }}>Match type</h2>
          <p style={{ color:'var(--text2)', fontSize:14, marginBottom:28 }}>Singles or doubles?</p>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {['singles','doubles'].map(t => (
              <div key={t} onClick={() => setType(t)}
                style={{
                  padding:'20px', borderRadius:'var(--radius)',
                  border:`1.5px solid ${type===t ? 'var(--accent)' : 'var(--border2)'}`,
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

        {/* ── Step 2 — Pick players + score (all on one screen) ── */}
        {step === 2 && <>

          {/* ── Formation template ── */}
          <div style={{
            background: 'var(--bg2)', border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 14px', marginBottom: 20,
          }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>

              {/* Team 1 */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--accent)', letterSpacing:'0.08em', marginBottom:8, textAlign:'center' }}>
                  Team 1
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {Array.from({ length: halfSlots }).map((_, i) => (
                    <SlotChip key={i} slotIdx={i} teamColor="var(--accent)" />
                  ))}
                </div>
              </div>

              {/* VS */}
              <div style={{ paddingTop:34, fontSize:11, fontWeight:700, color:'var(--text3)', flexShrink:0 }}>vs</div>

              {/* Team 2 */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#e05555', letterSpacing:'0.08em', marginBottom:8, textAlign:'center' }}>
                  Team 2
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {Array.from({ length: halfSlots }).map((_, i) => (
                    <SlotChip key={i} slotIdx={halfSlots + i} teamColor="#e05555" />
                  ))}
                </div>
              </div>
            </div>

            {/* Score row — inline with template */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:16 }}>
              <input
                type="number" inputMode="numeric" min="0" max="100"
                value={score1} onChange={e => setScore1(e.target.value)}
                placeholder="0"
                disabled={!playersReady}
                style={{
                  flex:1, background:'var(--bg3)',
                  border:`2px solid ${score1 && parseInt(score1) > parseInt(score2||0) ? 'var(--accent)' : 'var(--border2)'}`,
                  borderRadius:'var(--radius-sm)', padding:'14px 8px',
                  color:'var(--text)', fontSize:30, fontWeight:700,
                  textAlign:'center', outline:'none', fontFamily:"'Inter',sans-serif",
                  opacity: playersReady ? 1 : 0.35, transition:'opacity 0.2s',
                }}
              />
              <div style={{ fontSize:18, color:'var(--text3)', fontWeight:300, flexShrink:0 }}>—</div>
              <input
                type="number" inputMode="numeric" min="0" max="100"
                value={score2} onChange={e => setScore2(e.target.value)}
                placeholder="0"
                disabled={!playersReady}
                style={{
                  flex:1, background:'var(--bg3)',
                  border:`2px solid ${score2 && parseInt(score2) > parseInt(score1||0) ? '#e05555' : 'var(--border2)'}`,
                  borderRadius:'var(--radius-sm)', padding:'14px 8px',
                  color:'var(--text)', fontSize:30, fontWeight:700,
                  textAlign:'center', outline:'none', fontFamily:"'Inter',sans-serif",
                  opacity: playersReady ? 1 : 0.35, transition:'opacity 0.2s',
                }}
              />
            </div>

            {/* Winner / tie feedback */}
            {score1 !== '' && score2 !== '' && score1 === score2 && (
              <p style={{ color:'#ffc832', fontSize:12, textAlign:'center', marginTop:8 }}>
                Scores can't be equal — there must be a winner!
              </p>
            )}
            {playersReady && score1 !== '' && score2 !== '' && score1 !== score2 && (
              <div style={{ textAlign:'center', marginTop:8, fontSize:13, color:'var(--text2)' }}>
                Winner: <strong style={{ color: parseInt(score1)>parseInt(score2) ? 'var(--accent)' : '#e05555' }}>
                  {parseInt(score1) > parseInt(score2)
                    ? team1.map(id => getPlayerName(id)).join(' + ')
                    : team2.map(id => getPlayerName(id)).join(' + ')
                  }
                </strong>
              </div>
            )}
          </div>

          {/* ── Available players ── */}
          {sortedMembers.length > 0 && <>
            <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text3)', letterSpacing:'0.06em', marginBottom:10 }}>
              Tap to add
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:20 }}>
              {sortedMembers.map(m => {
                const taken = selectedIds.includes(m.id)
                return (
                  <button key={m.id}
                    onClick={() => !taken && handlePlayerTap(m.id)}
                    disabled={taken}
                    style={{
                      padding:'12px 6px', borderRadius:'var(--radius-sm)',
                      border:'1.5px solid transparent', background:'transparent',
                      color:'var(--text)', fontSize:13, fontWeight:500,
                      cursor: taken ? 'default' : 'pointer',
                      textAlign:'center', lineHeight:1.3,
                      fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
                      visibility: taken ? 'hidden' : 'visible',
                    }}>
                    {m.full_name?.split(' ')[0]}
                    {m.id === user.id && <span style={{ display:'block', fontSize:10, opacity:0.6, marginTop:2 }}>you</span>}
                  </button>
                )
              })}
            </div>
          </>}

          {/* ── Confirmation toggle ── */}
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

          {/* ── Submit ── */}
          <button className="btn btn-primary" onClick={submitMatch}
            disabled={!playersReady || !scoreReady || submitting}
            style={{ opacity: playersReady && scoreReady && !submitting ? 1 : 0.4 }}>
            {submitting ? 'Saving…' : requireConfirmation ? '⏳ Submit for Confirmation' : '✔ Submit Score'}
          </button>

        </>}

      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
