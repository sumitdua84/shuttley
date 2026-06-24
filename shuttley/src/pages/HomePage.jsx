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
  const [activePolls, setActivePolls] = useState([])
  const [myStats, setMyStats] = useState(null)
  const [liveSession, setLiveSession] = useState(null)
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

    const [{ data: pollData }, { data: liveSess }, pendingResult] = await Promise.all([
      supabase.from('session_polls')
        .select('id, club_id, session_date, session_time, notes, poll_responses(user_id)')
        .in('club_id', clubIds).eq('status', 'open').gte('session_date', today)
        .order('session_date', { ascending: true }),
      supabase.from('sessions')
        .select('id, name, club_id, started_at, match_type')
        .in('club_id', clubIds).eq('status', 'active').maybeSingle(),
      modClubIds.length > 0
        ? supabase.from('memberships')
            .select('*', { count: 'exact', head: true })
            .in('club_id', modClubIds).eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
    ])

    if (pollData) {
      // Filter out polls where session_date is today but session_time has already passed
      const relevant = pollData.filter(p => {
        if (p.session_date > today) return true
        if (!p.session_time) return true
        // session_date === today — check if time hasn't passed yet
        const [h, m] = p.session_time.split(':').map(Number)
        const sessionMs = h * 60 + m
        const nowMs = now.getHours() * 60 + now.getMinutes()
        return nowMs < sessionMs
      })
      // Keep only polls the user hasn't yet answered
      const unanswered = relevant.filter(p =>
        !p.poll_responses?.find(r => r.user_id === user.id)
      )
      setActivePolls(unanswered.map(p => ({ ...p, clubName: clubNameMap[p.club_id] })))
    }

    if (liveSess) {
      const mem = memList.find(m => m.club_id === liveSess.club_id)
      setLiveSession({
        ...liveSess,
        clubName: clubNameMap[liveSess.club_id],
        isMod: mem?.role === 'moderator',
      })
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
      .in('id', mpRows.map(r => r.match_id)).eq('status', 'confirmed')
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

  function formatPollDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const todayLabel = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
  const modMemberships = memberships.filter(m => m.role === 'moderator')

  return (
    <div className="page">
      <div className="topnav">
        <div>
          <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
            {greeting}, {firstName} 👋
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{todayLabel}</div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
        ) : <>

          {/* ── 1. My Performance ── */}
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

          {/* ── 2. Upcoming / Active Group Polls ── */}
          {activePolls.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Upcoming polls</div>
              {activePolls.map(poll => {
                const mem = memberships.find(m => m.club_id === poll.club_id)
                const isMod = mem?.role === 'moderator'
                return (
                  <div key={poll.id}
                    onClick={() => navigate(isMod ? `/club/${poll.club_id}/mod?tab=polls` : `/club/${poll.club_id}/member?tab=polls`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'var(--bg2)', border: '0.5px solid var(--border)',
                      borderLeft: '4px solid #256575',
                      borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {formatPollDate(poll.session_date)}{poll.session_time ? ` · ${poll.session_time.slice(0,5)}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {poll.clubName} · Tap to respond
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 3. Alerts / Attention ── */}
          {(liveSession || pendingMemberCount > 0) && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Needs attention</div>

              {/* Live session */}
              {liveSession && (
                <div style={{
                  background: 'var(--accent)', borderRadius: 'var(--radius)',
                  padding: '14px 16px', marginBottom: 8, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                      ● Live Session
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{liveSession.name}</div>
                    {liveSession.clubName && (
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{liveSession.clubName}</div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(
                      liveSession.isMod
                        ? `/club/${liveSession.club_id}/session/${liveSession.id}/rotation`
                        : `/club/${liveSession.club_id}/member`
                    )}
                    style={{
                      background: '#fff', color: 'var(--accent)', border: 'none',
                      borderRadius: 'var(--radius-sm)', padding: '8px 16px',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                      flexShrink: 0,
                    }}>
                    Continue →
                  </button>
                </div>
              )}

              {/* Pending approvals */}
              {pendingMemberCount > 0 && (
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
              )}
            </div>
          )}

          {/* Empty state — no data yet */}
          {(!myStats || myStats.total === 0) && activePolls.length === 0 && !liveSession && pendingMemberCount === 0 && (
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
