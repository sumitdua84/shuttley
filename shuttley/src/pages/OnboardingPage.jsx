import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { usePushNotifications } from '../hooks/usePushNotifications'

export default function OnboardingPage() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { subscribe } = usePushNotifications()

  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [clubName, setClubName] = useState('')
  const [clubDesc, setClubDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')
  const [fabOpen, setFabOpen] = useState(false)
  const [memberCounts, setMemberCounts] = useState({})
  const [polls, setPolls] = useState([])          // active polls across all clubs
  const [myResponses, setMyResponses] = useState({}) // pollId → 'yes'|'no'|'maybe'
  const [myStats, setMyStats] = useState(null)     // personal stats across all clubs
  const [statPeriod, setStatPeriod] = useState('15d')
  const [perfExpanded, setPerfExpanded] = useState(false)

  useEffect(() => { fetchAll() }, [user])

  async function fetchAll() {
    await fetchMemberships()
    fetchMyStats()  // non-blocking — pops in after clubs
  }

  async function fetchMemberships() {
    const { data, error } = await supabase
      .from('memberships')
      .select('id, user_id, club_id, role, status, joined_at, clubs(*)')
      .eq('user_id', user.id)
    if (error) console.error('Memberships error:', error)
    const list = data || []
    setMemberships(list)

    const approvedClubIds = list.filter(m => m.status === 'approved').map(m => m.club_id)

    // Member counts
    if (list.length > 0) {
      const { data: counts } = await supabase
        .from('memberships').select('club_id').in('club_id', list.map(m => m.club_id)).eq('status', 'approved')
      if (counts) {
        const countMap = {}
        counts.forEach(row => { countMap[row.club_id] = (countMap[row.club_id] || 0) + 1 })
        setMemberCounts(countMap)
      }
    }

    // Active polls — only today or future (auto-expire by session date)
    if (approvedClubIds.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      const { data: pollData } = await supabase
        .from('session_polls')
        .select('*, poll_responses(*)')
        .in('club_id', approvedClubIds)
        .eq('status', 'open')
        .gte('session_date', today)
        .order('session_date', { ascending: true })
      if (pollData) {
        setPolls(pollData)
        const resp = {}
        pollData.forEach(p => {
          const mine = p.poll_responses?.find(r => r.user_id === user.id)
          if (mine) resp[p.id] = mine.response
        })
        setMyResponses(resp)
      }
    }

    setLoading(false)
  }

  async function fetchMyStats() {
    const empty = { wins: 0, losses: 0, total: 0, pct: 0 }

    // Step 1 — get all match_player rows for this user
    const { data: mpRows } = await supabase
      .from('match_players')
      .select('match_id, side')
      .eq('user_id', user.id)

    if (!mpRows || mpRows.length === 0) {
      const blankPeriod = { overall: empty, clubs: {} }
      setMyStats({ '15d': blankPeriod, '30d': blankPeriod, '60d': blankPeriod, 'all': blankPeriod })
      return
    }

    // Step 2 — fetch those matches (confirmed only, include club_id)
    const matchIds = mpRows.map(r => r.match_id)
    const { data: matchRows } = await supabase
      .from('matches')
      .select('id, winner_side, played_at, status, club_id')
      .in('id', matchIds)
      .eq('status', 'confirmed')

    if (!matchRows || matchRows.length === 0) {
      const blankPeriod = { overall: empty, clubs: {} }
      setMyStats({ '15d': blankPeriod, '30d': blankPeriod, '60d': blankPeriod, 'all': blankPeriod })
      return
    }

    const sideMap = Object.fromEntries(mpRows.map(r => [r.match_id, r.side]))
    const clubIds = [...new Set(matchRows.map(m => m.club_id))]
    const now = new Date()

    function calcRows(rows) {
      let wins = 0, losses = 0
      rows.forEach(m => {
        const won = m.winner_side === sideMap[m.id]
        if (won) wins++; else losses++
      })
      const total = wins + losses
      return { wins, losses, total, pct: total > 0 ? Math.round(wins / total * 100) : 0 }
    }

    function buildPeriod(days) {
      const cutoff = days ? new Date(now.getTime() - days * 86400000) : null
      const rows = cutoff ? matchRows.filter(m => new Date(m.played_at) >= cutoff) : matchRows
      const overall = calcRows(rows)
      const clubs = {}
      clubIds.forEach(cid => { clubs[cid] = calcRows(rows.filter(m => m.club_id === cid)) })
      return { overall, clubs }
    }

    setMyStats({ '15d': buildPeriod(15), '30d': buildPeriod(30), '60d': buildPeriod(60), 'all': buildPeriod(null) })
  }

  async function respondToPoll(poll, response) {
    // First-time opt-in to push notifications (contextual — tied to poll action)
    if (!myResponses[poll.id]) {
      subscribe(user.id) // fire-and-forget, non-blocking
    }

    const existing = myResponses[poll.id]
    if (existing === response) return // already selected

    const { error } = await supabase.from('poll_responses').upsert(
      { poll_id: poll.id, user_id: user.id, response },
      { onConflict: 'poll_id,user_id' }
    )
    if (!error) {
      setMyResponses(prev => ({ ...prev, [poll.id]: response }))
      // Optimistically update counts in polls state
      setPolls(prev => prev.map(p => {
        if (p.id !== poll.id) return p
        const responses = p.poll_responses?.filter(r => r.user_id !== user.id) || []
        return { ...p, poll_responses: [...responses, { user_id: user.id, response }] }
      }))
    }
  }

  async function searchClubs(q) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    const { data } = await supabase
      .from('clubs').select('*, profiles!clubs_created_by_fkey(full_name)').ilike('name', `%${q}%`).limit(10)
    setSearchResults(data || [])
  }

  async function requestJoin(club) {
    const existing = memberships.find(m => m.club_id === club.id)
    if (existing) { showToast('Already a member or pending'); return }
    const { error } = await supabase.from('memberships').insert({
      user_id: user.id, club_id: club.id, role: 'member', status: 'pending'
    })
    if (!error) { showToast('Join request sent!'); fetchMemberships(); setView('home') }
  }

  async function createClub() {
    if (!clubName.trim()) return
    setCreating(true)

    // Generate the club id client-side so we never need to read the club
    // row back before the membership exists — the clubs SELECT policy
    // requires membership, so reading back too early can be blocked by
    // RLS even though the insert itself succeeded.
    const clubId = crypto.randomUUID()
    const { error: clubError } = await supabase
      .from('clubs')
      .insert({ id: clubId, name: clubName.trim(), description: clubDesc.trim(), created_by: user.id })
    if (clubError) {
      console.error('createClub: club insert failed', clubError)
      setCreating(false)
      showToast('Could not create the club — please try again')
      return
    }

    const { error: membershipError } = await supabase.from('memberships').insert({
      user_id: user.id, club_id: clubId, role: 'moderator', status: 'approved'
    })
    if (membershipError) {
      console.error('createClub: membership insert failed', membershipError)
      setCreating(false)
      showToast('Club created, but joining it failed — contact support')
      return
    }

    setCreating(false)
    setView('home'); setClubName(''); setClubDesc('')
    showToast('Club created!')

    try {
      await fetchMemberships()
    } catch (err) {
      console.error('createClub: refreshing club list failed', err)
      showToast('Club created — pull to refresh to see it')
    }
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function formatPollDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function pollCounts(poll) {
    const r = poll.poll_responses || []
    return {
      yes: r.filter(x => x.response === 'yes').length,
      no: r.filter(x => x.response === 'no').length,
      maybe: r.filter(x => x.response === 'maybe').length,
      total: r.length,
    }
  }

  const name = profile?.full_name || user?.email?.split('@')[0] || 'there'
  const avatar = profile?.avatar_url
  // Only show polls the user hasn't responded to yet
  const unansweredPolls = polls.filter(p => !myResponses[p.id])

  return (
    <div className="page">
      <div className="topnav">
        <div className="topnav-brand">
          <img src="/logo-source.png" alt="" className="topnav-brand-icon" />
          <div className="topnav-brand-text">
            <div className="topnav-logo">Shuttley</div>
            <div className="topnav-tagline">Your Game, Quantified</div>
          </div>
        </div>
        <button className="avatar-btn" onClick={() => navigate('/profile')} title="My profile">
          {avatar
            ? <img src={avatar} alt="avatar" />
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
          }
        </button>
      </div>

      <div className="content">
        {view === 'home' && <>
          <div style={{ marginBottom: unansweredPolls.length > 0 ? 16 : 28 }}>
            <h1 style={{ fontSize: 28, letterSpacing: '-0.5px', marginBottom: 4 }}>
              Hey, {name.split(' ')[0]}
            </h1>
          </div>

          {/* ── Active polls (unanswered only — disappears once you respond) ── */}
          {unansweredPolls.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">Session polls</div>
              {unansweredPolls.map(poll => {
                const clubName = memberships.find(m => m.club_id === poll.club_id)?.clubs?.name || 'Club'
                const counts = pollCounts(poll)
                const mine = myResponses[poll.id]
                return (
                  <div key={poll.id} style={{
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    borderLeft: '4px solid #256575',
                    borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 10,
                  }}>
                    {/* Header */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                      {clubName}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
                      Coming on {formatPollDate(poll.session_date)}?
                    </div>
                    {poll.session_time && (
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{poll.session_time}</div>
                    )}
                    {poll.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{poll.notes}</div>
                    )}

                    {/* Response buttons */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      {[
                        { key: 'yes',   label: 'Yes',   color: '#2a8c55', bg: 'rgba(42,140,85,0.1)',  border: 'rgba(42,140,85,0.3)'  },
                        { key: 'no',    label: 'No',    color: '#e05555', bg: 'rgba(224,85,85,0.1)',  border: 'rgba(224,85,85,0.3)'  },
                        { key: 'maybe', label: 'Maybe', color: '#a07800', bg: 'rgba(255,200,50,0.1)', border: 'rgba(220,175,20,0.3)' },
                      ].map(opt => (
                        <button key={opt.key} onClick={() => respondToPoll(poll, opt.key)} style={{
                          flex: 1, padding: '9px 4px', borderRadius: 'var(--radius-sm)',
                          fontSize: 13, fontWeight: mine === opt.key ? 700 : 500,
                          cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                          background: mine === opt.key ? opt.bg : 'transparent',
                          color: mine === opt.key ? opt.color : 'var(--text2)',
                          border: `1.5px solid ${mine === opt.key ? opt.border : 'var(--border)'}`,
                          transition: 'all 0.15s ease',
                        }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Live counts */}
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text3)' }}>
                      <span style={{ color: '#2a8c55', fontWeight: 600 }}>{counts.yes} ✓</span>
                      <span style={{ color: '#e05555', fontWeight: 600 }}>{counts.no} ✗</span>
                      {counts.maybe > 0 && <span style={{ color: '#a07800', fontWeight: 600 }}>{counts.maybe} maybe</span>}
                      {counts.total < (memberCounts[poll.club_id] || 0) && (
                        <span>{(memberCounts[poll.club_id] || 0) - counts.total} pending</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── My Performance ── */}
          {(() => {
            const Bar = () => null

            return (
              <div style={{ marginBottom: 24 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="section-label" style={{ marginBottom: 0 }}>My performance</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[['15d','15d'],['30d','30d'],['60d','60d'],['All','all']].map(([lbl, key]) => (
                      <button key={key} onClick={() => setStatPeriod(key)} style={{
                        padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                        background: statPeriod === key ? '#256575' : 'transparent',
                        color: statPeriod === key ? 'white' : 'var(--text3)',
                        border: `1px solid ${statPeriod === key ? '#256575' : 'var(--border)'}`,
                        cursor: 'pointer', fontFamily: "'Inter',sans-serif", transition: 'all 0.15s',
                      }}>{lbl}</button>
                    ))}
                  </div>
                </div>

                {/* Loading skeleton */}
                {!myStats ? (
                  <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', display: 'flex', justifyContent: 'space-around' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ width: 32, height: 18, background: 'var(--border)', borderRadius: 4, margin: '0 auto 4px' }}/>
                        <div style={{ width: 28, height: 8, background: 'var(--border)', borderRadius: 3, margin: '0 auto' }}/>
                      </div>
                    ))}
                  </div>
                ) : myStats[statPeriod].overall.total === 0 ? (
                  <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>No matches in this period</div>
                  </div>
                ) : (() => {
                  const s = myStats[statPeriod].overall
                  const clubEntries = Object.entries(myStats[statPeriod].clubs).filter(([, cs]) => cs.total > 0)
                  const hasMultiple = clubEntries.length > 1

                  return (
                    <>
                      {/* Overall tile */}
                      <div
                        onClick={hasMultiple ? () => setPerfExpanded(e => !e) : undefined}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: 'var(--bg2)', border: '0.5px solid var(--border)',
                          borderLeft: '4px solid #256575', borderRadius: 'var(--radius)',
                          padding: '10px 16px', cursor: hasMultiple ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>Overall</div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                            <span style={{ color: '#2a8c55', fontWeight: 600 }}>{s.wins}W</span>
                            {' · '}
                            <span style={{ color: '#e05555', fontWeight: 600 }}>{s.losses}L</span>
                            {' · '}
                            <span style={{ color: s.pct >= 50 ? '#256575' : '#e05555', fontWeight: 600 }}>{s.pct}%</span>
                            {' · '}{s.total} played
                          </div>
                        </div>
                        {hasMultiple && (
                          <span style={{
                            fontSize: 20, color: 'var(--text3)', flexShrink: 0,
                            display: 'inline-block', lineHeight: 1,
                            transform: perfExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                          }}>›</span>
                        )}
                      </div>

                      {/* Per-club tiles (expanded) */}
                      {perfExpanded && clubEntries.map(([cid, cs]) => {
                        const mem = memberships.find(m => m.club_id === cid)
                        const cName = mem?.clubs?.name || 'Club'
                        const isAdmin = mem?.role === 'moderator'
                        return (
                          <div key={cid} style={{
                            background: 'var(--bg2)', border: '0.5px solid var(--border)',
                            borderLeft: `4px solid ${isAdmin ? '#256575' : '#6ea6b4'}`, borderRadius: 'var(--radius)',
                            padding: '9px 16px', marginTop: 4,
                          }}>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{cName}</div>
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                              <span style={{ color: '#2a8c55', fontWeight: 600 }}>{cs.wins}W</span>
                              {' · '}
                              <span style={{ color: '#e05555', fontWeight: 600 }}>{cs.losses}L</span>
                              {' · '}
                              <span style={{ color: cs.pct >= 50 ? '#256575' : '#e05555', fontWeight: 600 }}>{cs.pct}%</span>
                              {' · '}{cs.total} played
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
            )
          })()}

          {/* ── My clubs ── */}
          {loading ? (
            <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
          ) : memberships.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>No clubs yet.<br />Join or create one below.</p>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">My clubs</div>
              {memberships.map(m => {
                const isAdmin = m.role === 'moderator'
                const count = memberCounts[m.club_id]
                const clubPolls = polls.filter(p => p.club_id === m.club_id)
                return (
                  <div key={m.id}
                    onClick={() => {
                      if (m.status !== 'approved') return
                      navigate(isAdmin ? `/club/${m.club_id}/mod` : `/club/${m.club_id}/member`)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center',
                      background: 'var(--bg2)', borderRadius: 'var(--radius)',
                      border: '0.5px solid var(--border)',
                      borderLeft: `4px solid ${isAdmin ? '#256575' : '#6ea6b4'}`,
                      marginBottom: 8, padding: '10px 16px',
                      cursor: m.status === 'approved' ? 'pointer' : 'default',
                      gap: 12,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{m.clubs?.name}</div>
                      {m.status === 'pending' ? (
                        <div style={{ fontSize: 12, color: '#ffc832', marginTop: 2 }}>Pending approval</div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                          {count ? `${count} member${count !== 1 ? 's' : ''}` : ''}
                          {clubPolls.length > 0 && <span style={{ color: '#256575', marginLeft: 6 }}>· {clubPolls.length} poll{clubPolls.length !== 1 ? 's' : ''}</span>}
                        </div>
                      )}
                    </div>
                    {m.status === 'approved' && (
                      <span style={{ fontSize: 20, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Join or create club — centred, content-width */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 8 }}>
            <button onClick={() => setFabOpen(o => !o)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'var(--bg2)', borderRadius: 'var(--radius)',
              border: '0.5px solid var(--border)',
              borderLeft: '4px solid #256575',
              padding: '8px 16px',
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              color: 'var(--accent)', fontSize: 13, fontWeight: 600,
              transition: 'all 0.15s ease',
            }}>
              Join or Create a Club
              <span style={{ fontSize: 20, color: 'var(--text3)', lineHeight: 1 }}>›</span>
            </button>
          </div>
        </>}

        {view === 'search' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('home'); setSearchQuery(''); setSearchResults([]) }}>← Back</button>
            <h2 style={{ fontSize: 22 }}>Find a club</h2>
          </div>
          <div className="input-wrap">
            <input className="input" placeholder="Search by club name…" value={searchQuery}
              onChange={e => searchClubs(e.target.value)} autoFocus />
          </div>
          {searchResults.length === 0 && searchQuery.length >= 2 && (
            <div className="empty"><p>No clubs found for "{searchQuery}"</p></div>
          )}
          {searchResults.map(club => (
            <div key={club.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 2 }}>{club.name}</div>
                {club.description && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{club.description}</div>}
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  Moderator: {club.profiles?.full_name || 'Unknown'}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => requestJoin(club)}>
                Request to join
              </button>
            </div>
          ))}
        </>}

        {view === 'create' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setView('home')}>← Back</button>
            <h2 style={{ fontSize: 22 }}>New club</h2>
          </div>
          <div className="input-wrap">
            <label className="input-label">Club name</label>
            <input className="input" placeholder="e.g. Tuesday Smashers" value={clubName}
              onChange={e => setClubName(e.target.value)} />
          </div>
          <div className="input-wrap">
            <label className="input-label">Description (optional)</label>
            <input className="input" placeholder="What's this club about?" value={clubDesc}
              onChange={e => setClubDesc(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={createClub} disabled={!clubName.trim() || creating}
            style={{ marginTop: 8, opacity: (!clubName.trim() || creating) ? 0.5 : 1 }}>
            {creating ? 'Creating…' : 'Create club'}
          </button>
        </>}
      </div>

      {toast && <div className="toast">{toast}</div>}

      {fabOpen && (
        <div onClick={() => setFabOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(37,101,117,0.18)', backdropFilter: 'blur(2px)',
        }} />
      )}
      {fabOpen && (
        <div style={{
          position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 40px)', maxWidth: 390, zIndex: 50,
          padding: '16px', background: '#fff', borderRadius: 16,
          border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(37,101,117,0.15)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <button onClick={() => { setFabOpen(false); setView('search') }} className="btn btn-secondary">
            Search for a club
          </button>
          <button onClick={() => { setFabOpen(false); setView('create') }} className="btn btn-secondary">
            Create a new club
          </button>
        </div>
      )}
    </div>
  )
}
