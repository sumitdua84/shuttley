import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'

export default function HomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [memberships, setMemberships] = useState([])
  const [activePolls, setActivePolls] = useState([])    // unanswered
  const [upcomingPolls, setUpcomingPolls] = useState([]) // answered yes
  const [myStats, setMyStats] = useState(null)
  const [rawMatchData, setRawMatchData] = useState(null) // for period filtering
  const [perfPeriod, setPerfPeriod] = useState('15d')
  const [perfExpanded, setPerfExpanded] = useState(false)
  const [liveSessions, setLiveSessions] = useState([])
  const [pendingMemberCount, setPendingMemberCount] = useState(0)
  const [pendingMatchAlerts, setPendingMatchAlerts] = useState([]) // per-group match confirmation alerts
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [user])

  // Recompute performance stats when period or raw data changes
  useEffect(() => {
    if (!rawMatchData) return
    const { mpRows, matchRows, clubNameMap } = rawMatchData
    let cutoff = null
    if (perfPeriod !== 'all') {
      cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(perfPeriod))
    }
    const filtered = cutoff
      ? matchRows.filter(m => m.played_at && new Date(m.played_at) >= cutoff)
      : matchRows
    const sideMap = Object.fromEntries(mpRows.map(r => [r.match_id, r.side]))
    let wins = 0, losses = 0
    const groupMap = {}
    filtered.forEach(m => {
      const won = m.winner_side === sideMap[m.id]
      if (won) wins++; else losses++
      if (m.club_id) {
        if (!groupMap[m.club_id]) groupMap[m.club_id] = { wins: 0, losses: 0 }
        if (won) groupMap[m.club_id].wins++; else groupMap[m.club_id].losses++
      }
    })
    const total = wins + losses
    const byGroup = Object.entries(groupMap)
      .map(([clubId, s]) => ({ clubId, clubName: clubNameMap[clubId] || 'Group', ...s }))
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
    setMyStats(total > 0 ? { wins, losses, total, pct: Math.round(wins / total * 100), byGroup } : null)
  }, [perfPeriod, rawMatchData])

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
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

    const [{ data: pollData }, { data: liveData }, pendingResult, { data: myMpData }] = await Promise.all([
      supabase.from('session_polls')
        .select('id, club_id, session_date, session_time, notes, poll_responses(user_id, response)')
        .in('club_id', clubIds)
        .eq('status', 'open')
        .or(`session_date.gte.${today},session_date.is.null`)
        .order('session_date', { ascending: true, nullsFirst: false })
        .order('session_time', { ascending: true, nullsFirst: true }),
      supabase.from('sessions')
        .select('id, name, club_id, started_at, match_type')
        .in('club_id', clubIds)
        .eq('status', 'active'),
      modClubIds.length > 0
        ? supabase.from('memberships')
            .select('*', { count: 'exact', head: true })
            .in('club_id', modClubIds).eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
      // Step 1: get user's match IDs (own rows always readable)
      supabase.from('match_players').select('match_id').eq('user_id', user.id),
    ])

    // Live sessions — always reset (clears stale state)
    const liveList = (liveData || []).map(s => {
      const mem = memList.find(m => m.club_id === s.club_id)
      return { ...s, clubName: clubNameMap[s.club_id], isMod: mem?.role === 'moderator' }
    })
    setLiveSessions(liveList)

    if (pollData) {
      // Supabase query already gates to session_date >= today and open status.
      // Do not further filter by session_time — polls for today's already-started
      // sessions are still unanswered and should appear on Home.
      const relevant = pollData

      const myResp = (p) => p.poll_responses?.find(r => r.user_id === user.id)?.response

      // Session polls where I said yes → Upcoming Sessions
      const yesPolls = relevant.filter(p => p.session_date && myResp(p) === 'yes')
      // Unanswered polls (session + custom) — show all polls the user hasn't responded to
      const unanswered = relevant.filter(p => !myResp(p))

      setUpcomingPolls(yesPolls.map(p => ({ ...p, clubName: clubNameMap[p.club_id] })))
      setActivePolls(unanswered.map(p => ({ ...p, clubName: clubNameMap[p.club_id] })))
    }

    setPendingMemberCount(pendingResult.count || 0)

    // Match alerts: two-step query avoids RLS join issues
    // Step 1 already done in Promise.all — we have the user's match IDs
    // Step 2: query matches directly with those IDs (RLS allows if user is club member)
    const myMpMatchIds = (myMpData || []).map(r => r.match_id).filter(Boolean)
    let alertMatches = []
    if (myMpMatchIds.length > 0) {
      const { data: am } = await supabase
        .from('matches')
        .select('id, club_id, recorded_by')
        .in('id', myMpMatchIds)
        .in('club_id', clubIds)
        .eq('status', 'pending')
        .neq('recorded_by', user.id)
      alertMatches = am || []
    }
    const byClub = {}
    alertMatches.forEach(m => {
      byClub[m.club_id] = (byClub[m.club_id] || 0) + 1
    })
    setPendingMatchAlerts(
      Object.entries(byClub).map(([clubId, count]) => ({
        clubId, count,
        clubName: clubNameMap[clubId],
        isMod: modClubIds.includes(clubId),
      }))
    )

    setLoading(false)

    fetchMyStats(memList)
  }

  async function fetchMyStats(memList) {
    const clubNameMap = Object.fromEntries((memList || []).map(m => [m.club_id, m.clubs?.name]))
    const { data: mpRows } = await supabase
      .from('match_players').select('match_id, side').eq('user_id', user.id)
    if (!mpRows?.length) { setRawMatchData(null); setMyStats(null); return }

    const { data: matchRows } = await supabase
      .from('matches').select('id, winner_side, played_at, club_id')
      .in('id', mpRows.map(r => r.match_id))
      .in('status', ['confirmed', 'pending'])
    if (!matchRows?.length) { setRawMatchData(null); setMyStats(null); return }

    // Store raw data — the useEffect([perfPeriod, rawMatchData]) computes filtered stats
    setRawMatchData({ mpRows, matchRows, clubNameMap })
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
  const _now = new Date()
  const hour = _now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`
  const modMemberships = memberships.filter(m => m.role === 'moderator')
  const liveClubIds = new Set(liveSessions.map(s => s.club_id))

  // Build club-grouped session blocks for Sessions card
  const sessionClubIds = [...new Set([
    ...liveSessions.map(s => s.club_id),
    ...upcomingPolls.map(p => p.club_id),
  ])]
  const _clubName = (id) =>
    liveSessions.find(s => s.club_id === id)?.clubName ||
    upcomingPolls.find(p => p.club_id === id)?.clubName || ''
  const sessionClubGroups = sessionClubIds
    .sort((a, b) => _clubName(a).localeCompare(_clubName(b)))
    .map(clubId => ({
      clubId,
      clubName: _clubName(clubId),
      liveSession: liveSessions.find(s => s.club_id === clubId) || null,
      upcoming: upcomingPolls
        .filter(p => p.club_id === clubId)
        .sort((a, b) => {
          const byDate = (a.session_date || '').localeCompare(b.session_date || '')
          if (byDate !== 0) return byDate
          if (!a.session_time && !b.session_time) return 0
          if (!a.session_time) return 1
          if (!b.session_time) return -1
          return a.session_time.localeCompare(b.session_time)
        }),
    }))

  return (
    <div className="page" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="topnav">
        <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
          {greeting}, {firstName}
        </div>
        <button onClick={() => navigate('/profile')} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }} aria-label="Profile">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </button>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
        ) : <>

          {/* ── 1. Action Needed (polls + alerts) ── */}
          {(activePolls.length > 0 || pendingMemberCount > 0 || pendingMatchAlerts.length > 0) && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">Action needed</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Polls needing response */}
                {activePolls.length > 0 && (
                  <div style={{
                    background: 'var(--bg2)', border: '0.5px solid var(--border)',
                    borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}>
                    {activePolls.map((poll, idx) => {
                      const title = getPollTitle(poll)
                      let customOpts = null
                      if (!poll.session_date && poll.notes) {
                        try {
                          const p = JSON.parse(poll.notes)
                          if (p.q && Array.isArray(p.opts) && p.opts.length >= 2) customOpts = p.opts
                        } catch {}
                      }
                      const isLast = idx === activePolls.length - 1
                      return (
                        <div key={poll.id}>
                          <div style={{ padding: '14px 16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textAlign: 'center', marginBottom: 8 }}>
                              {poll.clubName}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                              {title}
                              {poll.session_date && poll.session_time ? ` · ${poll.session_time.slice(0, 5)}` : ''}
                            </div>
                            {customOpts ? (
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${customOpts.length <= 3 ? customOpts.length : 2}, minmax(0, 1fr))`,
                                gap: 8,
                              }}>
                                {customOpts.map(opt => (
                                  <button key={opt} onClick={() => updatePollResponse(poll.id, opt, poll.club_id)} style={{
                                    padding: '9px 8px', borderRadius: 'var(--radius-sm)',
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    fontFamily: "'Inter',sans-serif",
                                    background: 'transparent', color: 'var(--accent)',
                                    border: '1.5px solid rgba(37,101,117,0.35)',
                                    width: '100%', textAlign: 'center',
                                    whiteSpace: 'normal', wordBreak: 'break-word',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    minHeight: 38,
                                  }}>{opt}</button>
                                ))}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 8 }}>
                                {[
                                  { key: 'yes',   label: 'Yes',   color: '#2a8c55', border: 'rgba(42,140,85,0.3)'  },
                                  { key: 'no',    label: 'No',    color: '#e05555', border: 'rgba(224,85,85,0.3)'  },
                                  { key: 'maybe', label: 'Maybe', color: '#a07800', border: 'rgba(220,175,20,0.3)' },
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
                          {!isLast && <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 16 }} />}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Match approvals / alerts */}
                {(pendingMemberCount > 0 || pendingMatchAlerts.length > 0) && (
                  <div style={{
                    background: 'rgba(255,200,50,0.08)', border: '0.5px solid rgba(255,200,50,0.3)',
                    borderRadius: 'var(--radius)', overflow: 'hidden',
                  }}>
                    {pendingMatchAlerts.map((alert, idx) => {
                      const showDivider = idx < pendingMatchAlerts.length - 1 || pendingMemberCount > 0
                      return (
                        <div key={alert.clubId}>
                          <div
                            onClick={() => navigate(
                              alert.isMod
                                ? `/club/${alert.clubId}/mod?tab=session`
                                : `/club/${alert.clubId}/member?tab=session`
                            )}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '14px 16px', cursor: 'pointer',
                            }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffc832' }}>
                                {alert.count} match{alert.count !== 1 ? 'es' : ''} need{alert.count === 1 ? 's' : ''} attention
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                                {alert.count} pending confirmation · {alert.clubName}
                              </div>
                            </div>
                            <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                          </div>
                          {showDivider && <div style={{ borderTop: '0.5px solid rgba(255,200,50,0.3)', marginLeft: 16 }} />}
                        </div>
                      )
                    })}
                    {pendingMemberCount > 0 && (
                      <div
                        onClick={() => {
                          if (modMemberships.length === 1) navigate(`/club/${modMemberships[0].club_id}/mod?tab=more`)
                          else navigate('/groups')
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '14px 16px', cursor: 'pointer',
                        }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffc832' }}>
                            {pendingMemberCount} pending approval{pendingMemberCount !== 1 ? 's' : ''}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Tap to review in your group</div>
                        </div>
                        <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── 2. Sessions (active + upcoming combined) ── */}
          {(liveSessions.length > 0 || upcomingPolls.length > 0) && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">Sessions</div>
              <div style={{
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}>
                {sessionClubGroups.map((group, groupIdx) => {
                  const isLastGroup = groupIdx === sessionClubGroups.length - 1
                  return (
                    <div key={group.clubId}>
                      {/* Active session — group name lives inside the teal block */}
                      {group.liveSession && (
                        <>
                          <div style={{
                            background: 'var(--accent)', padding: '14px 16px', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                                {group.clubName}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                                Session in Progress
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {group.liveSession.name}
                              </div>
                            </div>
                            <button
                              onClick={() => navigate(
                                group.liveSession.isMod
                                  ? `/club/${group.liveSession.club_id}/session/${group.liveSession.id}/rotation`
                                  : `/club/${group.liveSession.club_id}/member?tab=session`
                              )}
                              style={{
                                background: '#fff', color: 'var(--accent)', border: 'none',
                                borderRadius: 'var(--radius-sm)', padding: '8px 14px',
                                fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                                flexShrink: 0, whiteSpace: 'nowrap',
                              }}>
                              Open Current Session →
                            </button>
                          </div>
                          {group.upcoming.length > 0 && (
                            <div style={{ borderTop: '0.5px solid var(--border)' }} />
                          )}
                        </>
                      )}

                      {/* Upcoming poll rows — group name on first row only if no active session above */}
                      {group.upcoming.map((poll, pollIdx) => {
                        const mem = memberships.find(m => m.club_id === poll.club_id)
                        const isMod = mem?.role === 'moderator'
                        const isLastPoll = pollIdx === group.upcoming.length - 1
                        const showGroupName = !group.liveSession && pollIdx === 0
                        return (
                          <div key={poll.id}>
                            <div style={{ padding: '14px 16px' }}>
                              {showGroupName && (
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
                                  {group.clubName}
                                </div>
                              )}
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                                  {formatPollDate(poll.session_date)}
                                  {poll.session_time ? ` · ${poll.session_time.slice(0, 5)}` : ''}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 2 }}>
                                  You're in ✓
                                </div>
                              </div>
                              {isMod && !liveClubIds.has(poll.club_id) ? (
                                <button
                                  onClick={() => navigate(`/club/${poll.club_id}/mod`, { state: { startFromPollId: poll.id } })}
                                  style={{
                                    width: '100%', padding: '9px', background: 'var(--accent-dim)',
                                    color: 'var(--accent)', border: '1.5px solid var(--accent)',
                                    borderRadius: 'var(--radius-sm)', fontWeight: 700,
                                    fontSize: 13, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                                  }}>
                                  ▶ Start Session from this Poll
                                </button>
                              ) : (
                                <button
                                  onClick={() => navigate(`/club/${poll.club_id}/${isMod ? 'mod' : 'member'}`, { state: { tab: 'polls', openPollId: poll.id } })}
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
                            {!isLastPoll && <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 16 }} />}
                          </div>
                        )
                      })}

                      {!isLastGroup && <div style={{ borderTop: '0.5px solid var(--border)' }} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 3. My Performance ── */}
          {rawMatchData && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">My performance</div>

              <div style={{
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderLeft: '3px solid var(--accent)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
              }}>
                {/* Overall header: filter + stats */}
                <div style={{ padding: '18px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[['15d', '15d'], ['30d', '30d'], ['60d', '60d'], ['all', 'All']].map(([val, label]) => (
                        <button key={val} onClick={() => setPerfPeriod(val)} style={{
                          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', fontFamily: "'Inter',sans-serif", border: 'none',
                          background: perfPeriod === val ? 'var(--accent)' : 'var(--bg3)',
                          color: perfPeriod === val ? '#fff' : 'var(--text3)',
                          transition: 'background 0.15s',
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {!myStats ? (
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>No matches in this period.</div>
                  ) : (
                    <div onClick={() => setPerfExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{myStats.pct}%</span>
                          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 400 }}>win rate</span>
                        </div>
                        <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text3)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--success)' }}>{myStats.wins}W</span>
                          <span>·</span>
                          <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{myStats.losses}L</span>
                          <span>·</span>
                          <span>{myStats.total} played</span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 18, color: 'var(--text3)', flexShrink: 0, marginLeft: 8,
                        display: 'inline-block',
                        transform: perfExpanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.18s ease',
                      }}>›</span>
                    </div>
                  )}
                </div>

                {/* Per-group rows inside the same card when expanded */}
                {myStats && perfExpanded && myStats.byGroup?.map(g => {
                  const gTotal = g.wins + g.losses
                  const gPct = gTotal > 0 ? Math.round(g.wins / gTotal * 100) : 0
                  return (
                    <div key={g.clubId}>
                      <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 16 }} />
                      <div style={{ padding: '13px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{g.clubName}</div>
                        <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', color: 'var(--text3)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--success)' }}>{g.wins}W</span>
                          <span>·</span>
                          <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{g.losses}L</span>
                          <span>·</span>
                          <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{gPct}%</span>
                          <span>·</span>
                          <span>{gTotal} played</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 4. My Groups (compact shortcuts) ── */}
          {memberships.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">My groups</div>
              <div style={{
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}>
                {memberships.slice(0, 5).map((mem, idx) => {
                  const openPollCount = [
                    ...activePolls.filter(p => p.club_id === mem.club_id),
                    ...upcomingPolls.filter(p => p.club_id === mem.club_id),
                  ].length
                  const dashPath = mem.role === 'moderator'
                    ? `/club/${mem.club_id}/mod?tab=session`
                    : `/club/${mem.club_id}/member?tab=session`
                  const isLast = idx === Math.min(memberships.length, 5) - 1 && memberships.length <= 5
                  return (
                    <div key={mem.club_id}>
                      <div onClick={() => navigate(dashPath)} style={{
                        display: 'flex', alignItems: 'center',
                        padding: '13px 16px', cursor: 'pointer',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, color: 'var(--text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {mem.clubs?.name}
                          </div>
                        </div>
                        {openPollCount > 0 && (
                          <div style={{
                            background: 'var(--accent-dim)', color: 'var(--accent)',
                            fontSize: 11, fontWeight: 600,
                            padding: '2px 8px', borderRadius: 99,
                            flexShrink: 0, marginRight: 8, whiteSpace: 'nowrap',
                          }}>
                            {openPollCount} open poll{openPollCount !== 1 ? 's' : ''}
                          </div>
                        )}
                        <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                      </div>
                      {!isLast && <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 16 }} />}
                    </div>
                  )
                })}
                {memberships.length > 5 && (
                  <>
                    <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 16 }} />
                    <div onClick={() => navigate('/groups')} style={{
                      padding: '12px 16px', cursor: 'pointer',
                      fontSize: 13, color: 'var(--text3)',
                      fontFamily: "'Inter',sans-serif",
                    }}>
                      + {memberships.length - 5} more groups
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Empty state — only when no groups at all */}
          {memberships.length === 0 && !rawMatchData && activePolls.length === 0 && liveSessions.length === 0 && pendingMemberCount === 0 && (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>Welcome! Join or create a group to start playing.</p>
              <button className="btn btn-primary" onClick={() => navigate('/groups')} style={{ marginTop: 12 }}>
                Find a group
              </button>
            </div>
          )}

        </>}
      </div>

      <Toast message={toast} />
    </div>
  )
}
