import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

const WEEKDAY_NAMES = {
  0: 'Sunday Game',
  1: 'Monday Badminton',
  2: 'Tuesday Game',
  3: 'Wednesday Social',
  4: 'Thursday Badminton',
  5: 'Friday Smash',
  6: 'Saturday Badminton',
}

function defaultSessionName() {
  return WEEKDAY_NAMES[new Date().getDay()]
}

function timeAgo(startedAt) {
  const mins = Math.floor((Date.now() - new Date(startedAt)) / 60000)
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem === 0 ? `${hrs}h ago` : `${hrs}h ${rem}m ago`
}

function sessionDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SessionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [memberships, setMemberships] = useState([])
  const [liveSessions, setLiveSessions] = useState([])
  const [pastSessions, setPastSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Creation modal
  const [showModal, setShowModal] = useState(false)
  const [modalClubId, setModalClubId] = useState(null)
  const [modalName, setModalName] = useState('')
  const [modalType, setModalType] = useState('doubles')

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
        .select('id, name, club_id, started_at, match_type, rotation_player_ids, matches(count)')
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

  function openCreationModal() {
    if (modMemberships.length === 0) {
      showToast('Only group moderators can start sessions')
      return
    }
    setModalClubId(modMemberships[0].club_id)
    setModalName(defaultSessionName())
    setModalType('doubles')
    setShowModal(true)
  }

  function confirmStart() {
    const name = modalName.trim() || defaultSessionName()
    setShowModal(false)
    navigate(`/club/${modalClubId}/mod`, {
      state: { prefillName: name, prefillType: modalType, autoStart: true }
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function playerCount(s) {
    return s.rotation_player_ids?.length || 0
  }

  function matchCount(s) {
    return s.matches?.[0]?.count || 0
  }

  function sessionMeta(s) {
    const players = playerCount(s)
    const matches = matchCount(s)
    const parts = []
    if (players > 0) parts.push(`${players} player${players !== 1 ? 's' : ''}`)
    if (matches > 0) parts.push(`${matches} match${matches !== 1 ? 'es' : ''}`)
    if (parts.length === 0 && s.match_type) parts.push(s.match_type)
    return parts.join(' · ')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const liveSession = liveSessions[0] || null
  const lastPast = pastSessions[0] || null
  const isMod = modMemberships.length > 0

  return (
    <div className="page">
      <div className="topnav">
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Session
        </span>
      </div>

      <div className="content" style={{ paddingBottom: 90 }}>

        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, paddingTop: 20 }}>Loading...</div>
        ) : (
          <>
            {/* ── Hero Card ─────────────────────────────────────────────── */}
            {liveSession ? (() => {
              const mem = memberships.find(m => m.club_id === liveSession.club_id)
              const isModForThis = mem?.role === 'moderator'
              const dest = isModForThis
                ? `/club/${liveSession.club_id}/session/${liveSession.id}/rotation`
                : `/club/${liveSession.club_id}/member`
              const meta = sessionMeta(liveSession)

              return (
                <div style={{
                  background: 'var(--accent)', borderRadius: 'var(--radius)',
                  padding: '20px', marginBottom: 24,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
                    Live Session
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 2 }}>
                    {liveSession.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: meta ? 4 : 0 }}>
                    Started {timeAgo(liveSession.started_at)}
                  </div>
                  {meta && (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 16 }}>
                      {meta}
                    </div>
                  )}
                  {!meta && <div style={{ marginBottom: 16 }} />}
                  <button
                    onClick={() => navigate(dest)}
                    style={{
                      width: '100%', padding: '11px', border: '1.5px solid rgba(255,255,255,0.5)',
                      borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.15)',
                      color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Inter',sans-serif",
                    }}>
                    Resume Session
                  </button>
                </div>
              )
            })() : (
              <div style={{
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '20px', marginBottom: 24,
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 6 }}>
                  Ready to Play?
                </div>
                {lastPast ? (
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
                    Last session: {lastPast.name}<br />
                    {sessionDate(lastPast.ended_at)}{sessionMeta(lastPast) ? ` · ${sessionMeta(lastPast)}` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
                    Start a new session to record matches,{'\n'}track scores and build player statistics.
                  </div>
                )}
                {isMod && (
                  <button
                    onClick={openCreationModal}
                    style={{
                      width: '100%', padding: '11px',
                      background: 'var(--accent)', border: 'none',
                      borderRadius: 'var(--radius-sm)', color: '#fff',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Inter',sans-serif",
                    }}>
                    Start Session
                  </button>
                )}
              </div>
            )}

            {/* ── Session History ────────────────────────────────────────── */}
            {pastSessions.length > 0 && (
              <>
                <div className="section-label" style={{ marginBottom: 10 }}>Session History</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pastSessions.map(s => {
                    const meta = sessionMeta(s)
                    const showClub = memberships.length > 1
                    return (
                      <div
                        key={s.id}
                        onClick={() => navigate(`/club/${s.club_id}/session/${s.id}`)}
                        style={{
                          background: 'var(--bg2)', border: '0.5px solid var(--border)',
                          borderRadius: 'var(--radius)', padding: '14px 16px',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                            {sessionDate(s.ended_at)}
                            {showClub && s.clubName ? ` · ${s.clubName}` : ''}
                            {meta ? ` · ${meta}` : ''}
                          </div>
                        </div>
                        <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* ── Empty state ────────────────────────────────────────────── */}
            {pastSessions.length === 0 && !liveSession && (
              <div className="empty">
                <p style={{ color: 'var(--text3)', fontSize: 14, textAlign: 'center', lineHeight: 1.6 }}>
                  No sessions yet.{'\n'}Start one to begin tracking matches.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Creation Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 0 0 0',
          }}
          onClick={() => setShowModal(false)}>
          <div
            style={{
              background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
              padding: '28px 20px 40px', width: '100%', maxWidth: 480,
            }}
            onClick={e => e.stopPropagation()}>

            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", color: 'var(--text)', marginBottom: 20 }}>
              New Session
            </div>

            {/* Club selector — only shown if user moderates multiple groups */}
            {modMemberships.length > 1 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Group
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {modMemberships.map(m => (
                    <button
                      key={m.club_id}
                      onClick={() => setModalClubId(m.club_id)}
                      style={{
                        padding: '10px 14px', borderRadius: 'var(--radius-sm)', textAlign: 'left',
                        background: modalClubId === m.club_id ? 'var(--accent-dim)' : 'var(--bg3)',
                        border: modalClubId === m.club_id ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                        color: modalClubId === m.club_id ? 'var(--accent)' : 'var(--text)',
                        fontSize: 14, fontWeight: 500, cursor: 'pointer',
                        fontFamily: "'Inter',sans-serif",
                      }}>
                      {m.clubs?.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Session Name */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Session Name
              </div>
              <input
                type="text"
                value={modalName}
                onChange={e => setModalName(e.target.value)}
                maxLength={60}
                placeholder={defaultSessionName()}
                style={{
                  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                  background: 'var(--bg3)', border: '0.5px solid var(--border2)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                  fontSize: 15, fontFamily: "'Inter',sans-serif", outline: 'none',
                }}
              />
            </div>

            {/* Match Type */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Match Type
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['doubles', 'Doubles'], ['singles', 'Singles']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setModalType(val)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)',
                      background: modalType === val ? 'var(--accent-dim)' : 'var(--bg3)',
                      border: modalType === val ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                      color: modalType === val ? 'var(--accent)' : 'var(--text2)',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Inter',sans-serif",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={confirmStart}
              style={{
                width: '100%', padding: '13px', marginBottom: 10,
                background: 'var(--accent)', border: 'none',
                borderRadius: 'var(--radius-sm)', color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}>
              Start Session
            </button>
            <button
              onClick={() => setShowModal(false)}
              style={{
                width: '100%', padding: '11px',
                background: 'none', border: 'none',
                color: 'var(--text3)', fontSize: 14, cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <Toast message={toast} />
      <BottomNav activeTab="session" />
    </div>
  )
}
