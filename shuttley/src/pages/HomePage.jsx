import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

export default function HomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [memberships, setMemberships] = useState([])
  const [activePolls, setActivePolls] = useState([])    // unanswered
  const [upcomingPolls, setUpcomingPolls] = useState([]) // answered yes
  const [myStats, setMyStats] = useState(null)
  const [liveSessions, setLiveSessions] = useState([])
  const [pendingMemberCount, setPendingMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [user])

  async function fetchAll() {
    if (!user) return

    const { data: mems } = await supabase
      .from('memberships')
      .select('club_id, role, status, clubs(id, name)')
      .eq('user_id', user.id)
      .eq('status', 'approved')

    const memList = mems || []
    setMemberships(memList)

    const clubIds = memList.map(m => m.club_id)
    const modClubIds = memList.filter(m => m.role === 'moderator').map(m => m.club_id)
    const clubNameMap = Object.fromEntries(memList.map(m => [m.club_id, m.clubs?.name]))

    if (clubIds.length === 0) { setLoading(false); return }

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    const [{ data: pollData }, { data: liveData }, pendingResult] = await Promise.all([
      supabase.from('session_polls')
        .select('id, club_id, session_date, session_time, notes, poll_responses(user_id, response)')
        .in('club_id', clubIds)
        .eq('status', 'open')
        .or(`session_date.gte.${today},session_date.is.null`)
        .order('session_date', { ascending: true, nullsFirst: false }),
      supabase.from('sessions')
        .select('id, name, club_id, started_at, match_type')
        .in('club_id', clubIds)
        .eq('status', 'active'),
      modClubIds.length > 0
        ? supabase.from('memberships')
            .select('*', { count: 'exact', head: true })
            .in('club_id', modClubIds).eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
    ])

    if (pollData) {
      const relevant = pollData.filter(p => {
        if (!p.session_date) return true // custom polls always relevant
        if (p.session_date > today) return true
        if (!p.session_time) return true
        const [h, m] = p.session_time.split(':').map(Number)
        const sessionMs = h * 60 + m
        const nowMs = now.getHours() * 60 + now.getMinutes()
        return nowMs < sessionMs
      })

      const myResp = (p) => p.poll_responses?.find(r => r.user_id === user.id)?.response

      // Session polls where I said yes → Upcoming Sessions
      const yesPolls = relevant.filter(p => p.session_date && myResp(p) === 'yes')
      // All polls I haven't answered yet (session + custom)
      const unanswered = relevant.filter(p => !myResp(p))
      // no/maybe → not shown on home (already responded, no action needed)

      setUpcomingPolls(yesPolls.map(p => ({ ...p, clubName: clubNameMap[p.club_id] })))
      setActivePolls(unanswered.map(p => ({ ...p, clubName: clubNameMap[p.club_id] })))
    }

    if (liveData && liveData.length > 0) {
      setLiveSessions(liveData.map(s => {
        const mem = memList.find(m => m.club_id === s.club_id)
        return {
          ...s,
          clubName: clubNameMap[s.club_id],
          isMod: mem?.role === 'moderator',
        }
      }))
    }

    setPendingMemberCount(pendingResult.count || 0)
    setLoading(false)

    fetchMyStats()
  }

  async function fetchMyStats() {
    const { data: mpRows } = await supabase
      .from('match_players').select('match_id, side').eq('user_id', user.id)
    if (!mpRows?.length) { setMyStats({ wins: 0, losses: 0, total: 0, pct: 0, form: [] }); return }

    const { data: matchRows } = await supabase
      .from('matches').select('id, winner_side, played_at')
      .in('id', mpRows.map(r => r.match_id))
      .in('status', ['confirmed', 'pending'])
    if (!matchRows?.length) { setMyStats({ wins: 0, losses: 0, total: 0, pct: 0, form: [] }); return }

    const sideMap = Object.fromEntries(mpRows.map(r => [r.match_id, r.side]))
    let wins = 0, losses = 0
    matchRows.forEach(m => { if (m.winner_side === sideMap[m.id]) wins++; else losses++ })
    const total = wins + losses
    const recent = [...matchRows]
      .sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
      .slice(0, 5)
    const form = recent.map(m => m.winner_side === sideMap[m.id] ? 'W' : 'L')
    setMyStats({ wins, losses, total, pct: total > 0 ? Math.round(wins / total * 100) : 0, form })
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function updatePollResponse(pollId, response, pollClubId) {
    await supabase.from('poll_responses').upsert(
      { poll_id: pollId, user_id: user.id, response },
      { onConflict: 'poll_id,user_id' }
    )
    // Update local state immediately — no full refetch
    if (response === 'yes') {
      // Move from activePolls → upcomingPolls (only session polls have session_date)
      const poll = activePolls.find(p => p.id === pollId)
      if (poll?.session_date) {
        setActivePolls(prev => prev.filter(p => p.id !== pollId))
        setUpcomingPolls(prev => [...prev, poll])
      } else {
        // Custom poll answered yes — just remove from needing response
        setActivePolls(prev => prev.filter(p => p.id !== pollId))
      }
    } else {
      // no/maybe — remove from home (poll is answered, no longer needs response)
      setActivePolls(prev => prev.filter(p => p.id !== pollId))
    }
  }

  function formatPollDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  function getPollTitle(poll) {
    if (poll.session_date) {
      return `Coming ${formatPollDate(poll.session_date)}?`
    }
    // Custom poll — try to parse JSON notes
    if (poll.notes) {
      try {
        const parsed = JSON.parse(poll.notes)
        if (parsed.q) return parsed.q
      } catch {}
      return poll.notes.split('\n')[0] || 'Poll'
    }
    return 'Custom Poll'
  }

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const modMemberships = memberships.filter(m => m.role === 'moderator')

  return (
    <div className="page">
      <div className="topnav">
        <div>
          <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
            {greeting}, {firstName}
          </div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
        ) : <>

          {/* ── 1. Session in Progress (TOP PRIORITY) ── */}
          {liveSessions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {liveSessions.map(sess => (
                <div key={sess.id} style={{
                  background: 'var(--accent)', borderRadius: 'var(--radius)',
                  padding: '16px 18px', marginBottom: 8, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                      ● Session in Progress
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sess.name}
                    </div>
                    {sess.clubName && (
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{sess.clubName}</div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(
                      sess.isMod
                        ? `/club/${sess.club_id}/session/${sess.id}/rotation`
                        : `/club/${sess.club_id}/member?tab=session`
                    )}
                    style={{
                      background: '#fff', color: 'var(--accent)', border: 'none',
                      borderRadius: 'var(--radius-sm)', padding: '8px 14px',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}>
                    Open Session →
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── 2. My Performance ── */}
          {myStats && myStats.total > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">My performance</div>
              <div style={{
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderLeft: '4px solid #256575', borderRadius: 'var(--radius)',
                padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#2a8c55' }}>{myStats.wins}W</span>
                    <span style={{ fontSize: 16, color: 'var(--text3)', margin: '0 6px' }}>·</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#e05555' }}>{myStats.losses}L</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: myStats.pct >= 50 ? '#256575' : '#e05555' }}>
                      {myStats.pct}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>win rate</div>
                  </div>
                </div>
                {myStats.form?.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginRight: 2 }}>Recent</span>
                    {myStats.form.map((r, i) => (
                      <span key={i} style={{
                        width: 22, height: 22, borderRadius: 4, fontSize: 10, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: r === 'W' ? 'rgba(42,140,85,0.12)' : 'rgba(224,85,85,0.12)',
                        color: r === 'W' ? '#2a8c55' : '#e05555',
                      }}>{r}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {myStats.total} matches · all groups
                </div>
              </div>
            </div>
          )}

          {/* ── 3. Upcoming Sessions (answered yes) ── */}
          {upcomingPolls.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Upcoming sessions</div>
              {upcomingPolls.map(poll => {
                const mem = memberships.find(m => m.club_id === poll.club_id)
                const isMod = mem?.role === 'moderator'
                const liveSession = liveSessions.find(s => s.club_id === poll.club_id)
                return (
                  <div key={poll.id} style={{
                    background: 'var(--bg2)', border: '0.5px solid var(--border)',
                    borderLeft: '4px solid #2a8c55',
                    borderRadius: 'var(--radius)', padding: '13px 14px', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: liveSession || isMod ? 10 : 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          {formatPollDate(poll.session_date)}
                          {poll.session_time ? ` · ${poll.session_time.slice(0, 5)}` : ''}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          {poll.clubName}
                          <span style={{ marginLeft: 6, color: '#2a8c55', fontWeight: 600 }}>· You're in ✓</span>
                        </div>
                      </div>
                    </div>

                    {liveSession ? (
                      // Session already started → Open Current Session
                      <button
                        onClick={() => navigate(
                          isMod
                            ? `/club/${poll.club_id}/session/${liveSession.id}/rotation`
                            : `/club/${poll.club_id}/member?tab=session`
                        )}
                        style={{
                          width: '100%', padding: '9px', background: 'var(--accent)', color: '#fff',
                          border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 700,
                          fontSize: 13, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                        }}>
                        Open Current Session →
                      </button>
                    ) : isMod ? (
                      // No session yet, user is mod → Start Session from this Poll
                      <button
                        onClick={() => navigate(`/club/${poll.club_id}/mod?tab=polls`, { state: { openPollId: poll.id } })}
                        style={{
                          width: '100%', padding: '9px', background: 'var(--accent-dim)',
                          color: 'var(--accent)', border: '1.5px solid var(--accent)',
                          borderRadius: 'var(--radius-sm)', fontWeight: 700,
                          fontSize: 13, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                        }}>
                        ▶ Start Session from this Poll
                      </button>
                    ) : (
                      // Member, no session yet → View Poll
                      <button
                        onClick={() => navigate(`/club/${poll.club_id}/member?tab=polls`)}
                        style={{
                          width: '100%', padding: '9px', background: 'transparent',
                          color: 'var(--text2)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)', fontWeight: 600,
                          fontSize: 13, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                        }}>
                        View Poll →
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 4. Polls needing response (unanswered — session + custom) ── */}
          {activePolls.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Polls needing your response</div>
              {activePolls.map(poll => {
                const title = getPollTitle(poll)
                // Parse custom options for custom polls
                let customOpts = null
                if (!poll.session_date && poll.notes) {
                  try {
                    const p = JSON.parse(poll.notes)
                    if (p.q && Array.isArray(p.opts) && p.opts.length >= 2) customOpts = p.opts
                  } catch {}
                }
                return (
                  <div key={poll.id} style={{
                    background: 'var(--bg2)', border: '0.5px solid var(--border)',
                    borderLeft: `4px solid ${!poll.session_date ? 'var(--accent)' : '#256575'}`,
                    borderRadius: 'var(--radius)', padding: '13px 14px', marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                      {title}
                      {poll.session_date && poll.session_time ? ` · ${poll.session_time.slice(0, 5)}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
                      {poll.clubName}
                    </div>
                    {customOpts ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {customOpts.map(opt => (
                          <button key={opt} onClick={() => updatePollResponse(poll.id, opt, poll.club_id)} style={{
                            padding: '8px 12px', borderRadius: 'var(--radius-sm)', textAlign: 'left',
                            fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            fontFamily: "'Inter',sans-serif",
                            background: 'transparent', color: 'var(--text2)',
                            border: '1.5px solid var(--border)',
                          }}>{opt}</button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[
                          { key: 'yes',   label: 'Yes',   color: '#2a8c55', bg: 'rgba(42,140,85,0.1)',  border: 'rgba(42,140,85,0.3)'  },
                          { key: 'no',    label: 'No',    color: '#e05555', bg: 'rgba(224,85,85,0.1)',  border: 'rgba(224,85,85,0.3)'  },
                          { key: 'maybe', label: 'Maybe', color: '#a07800', bg: 'rgba(255,200,50,0.1)', border: 'rgba(220,175,20,0.3)' },
                        ].map(opt => (
                          <button key={opt.key} onClick={() => updatePollResponse(poll.id, opt.key, poll.club_id)} style={{
                            flex: 1, padding: '9px 4px', borderRadius: 'var(--radius-sm)',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'Inter',sans-serif",
                            background: 'transparent', color: opt.color,
                            border: `1.5px solid ${opt.border}`,
                          }}>{opt.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 5. Alerts ── */}
          {pendingMemberCount > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Needs attention</div>
              <div
                onClick={() => {
                  if (modMemberships.length === 1) navigate(`/club/${modMemberships[0].club_id}/mod?tab=more`)
                  else navigate('/groups')
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(255,200,50,0.07)', border: '1px solid rgba(255,200,50,0.3)',
                  borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
                }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ffc832' }}>
                    {pendingMemberCount} pending approval{pendingMemberCount !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Tap to review in your group</div>
                </div>
                <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!myStats || myStats.total === 0) && activePolls.length === 0 && upcomingPolls.length === 0 && liveSessions.length === 0 && pendingMemberCount === 0 && (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>Welcome! Tap <strong>Groups</strong> below to join or create a group and start playing.</p>
            </div>
          )}

        </>}
      </div>

      <Toast message={toast} />
      <BottomNav activeTab="home" />
    </div>
  )
}
