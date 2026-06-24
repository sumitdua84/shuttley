import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

export default function SessionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [memberships, setMemberships] = useState([])
  const [liveSessions, setLiveSessions] = useState([])
  const [pastSessions, setPastSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showGroupPicker, setShowGroupPicker] = useState(false)

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
    if (clubIds.length === 0) { setLoading(false); return }

    const clubNameMap = Object.fromEntries(memList.map(m => [m.club_id, m.clubs?.name]))

    const [{ data: live }, { data: past }] = await Promise.all([
      supabase.from('sessions')
        .select('id, name, club_id, started_at, match_type, rotation_player_ids')
        .in('club_id', clubIds).eq('status', 'active'),
      supabase.from('sessions')
        .select('id, name, club_id, started_at, ended_at, match_type, rotation_player_ids, matches(count)')
        .in('club_id', clubIds).eq('status', 'ended')
        .order('ended_at', { ascending: false }).limit(20),
    ])

    setLiveSessions((live || []).map(s => ({ ...s, clubName: clubNameMap[s.club_id] })))
    setPastSessions((past || []).map(s => ({ ...s, clubName: clubNameMap[s.club_id] })))
    setLoading(false)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const modMemberships = memberships.filter(m => m.role === 'moderator')

  function handleStartSession() {
    if (modMemberships.length === 0) {
      showToast('Only group moderators can start sessions')
      return
    }
    if (modMemberships.length === 1) {
      navigate(`/club/${modMemberships[0].club_id}/mod`)
    } else {
      setShowGroupPicker(p => !p)
    }
  }

  return (
    <div className="page">
      <div className="topnav">
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Session
        </span>
      </div>

      <div className="content">

        {/* ── Start New Session ── */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={handleStartSession} style={{
            width: '100%', padding: '13px',
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius)',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Inter',sans-serif",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            ▶ Start New Session
          </button>

          {/* Group picker — shown when user moderates multiple groups */}
          {showGroupPicker && (
            <div style={{
              marginTop: 8, background: 'var(--bg2)', border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '14px',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                Choose a group to start a session in:
              </div>
              {modMemberships.map(m => (
                <button key={m.club_id}
                  onClick={() => { setShowGroupPicker(false); navigate(`/club/${m.club_id}/mod`) }}
                  style={{
                    width: '100%', padding: '11px 14px', marginBottom: 6,
                    background: 'var(--bg3)', borderRadius: 'var(--radius-sm)',
                    border: '0.5px solid var(--border)', cursor: 'pointer',
                    fontSize: 14, fontWeight: 500, color: 'var(--text)',
                    textAlign: 'left', fontFamily: "'Inter',sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                  {m.clubs?.name}
                  <span style={{ color: 'var(--text3)' }}>›</span>
                </button>
              ))}
              <button onClick={() => setShowGroupPicker(false)} style={{
                width: '100%', padding: '8px', marginTop: 2,
                background: 'none', border: 'none', color: 'var(--text3)',
                fontSize: 13, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
              }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14 }}>Loading…</div>
        ) : <>

          {/* ── Live sessions ── */}
          {liveSessions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Live now</div>
              {liveSessions.map(s => {
                const mem = memberships.find(m => m.club_id === s.club_id)
                const isMod = mem?.role === 'moderator'
                const dest = isMod
                  ? `/club/${s.club_id}/session/${s.id}/rotation`
                  : `/club/${s.club_id}/member`
                return (
                  <div key={s.id} onClick={() => navigate(dest)} style={{
                    background: 'var(--accent)', borderRadius: 'var(--radius)',
                    padding: '16px 20px', marginBottom: 8, cursor: 'pointer', color: '#fff',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
                      ● Live Session
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{s.name}</div>
                    {s.clubName && (
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{s.clubName}</div>
                    )}
                    {s.rotation_player_ids?.length > 0 && (
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                        {s.rotation_player_ids.length} players · {s.match_type || 'doubles'}
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 12 }}>Continue Session →</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Past sessions ── */}
          {pastSessions.length > 0 ? (
            <div>
              <div className="section-label">Recent sessions</div>
              {pastSessions.map(s => {
                const matchCount = s.matches?.[0]?.count || 0
                const dateLabel = s.ended_at
                  ? new Date(s.ended_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                  : '—'
                return (
                  <div key={s.id}
                    onClick={() => navigate(`/club/${s.club_id}/session/${s.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 0', borderBottom: '0.5px solid var(--border)',
                      cursor: 'pointer',
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        {s.clubName && <>{s.clubName} · </>}
                        {matchCount > 0 ? `${matchCount} match${matchCount !== 1 ? 'es' : ''}` : s.match_type || '—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>{dateLabel}</div>
                    <span style={{ fontSize: 16, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                  </div>
                )
              })}
            </div>
          ) : liveSessions.length === 0 && (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>No sessions yet.<br />Start one above to begin tracking matches.</p>
            </div>
          )}

        </>}
      </div>

      <Toast message={toast} />
      <BottomNav activeTab="session" />
    </div>
  )
}
