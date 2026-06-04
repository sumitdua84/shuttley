import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { usePushNotifications } from '../hooks/usePushNotifications'

const FEATURES = ['splits', 'chat']

// ── Only these emails can access /admin ──────────────────────────
const SUPER_ADMINS = ['sumit@shuttley.club', 'sumitdua84@gmail.com']

export default function AdminDashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { sendPush } = usePushNotifications()

  const [stats, setStats]           = useState(null)
  const [clubs, setClubs]           = useState([])
  const [users, setUsers]           = useState([])
  const [sessions, setSessions]     = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [tab, setTab]               = useState('clubs')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle]   = useState('')
  const [broadcastBody, setBroadcastBody]     = useState('')
  const [broadcastTarget, setBroadcastTarget] = useState('all') // 'all' | clubId
  const [sending, setSending]                 = useState(false)
  const [broadcastToast, setBroadcastToast]   = useState('')
  const [features, setFeatures]               = useState([])

  // Guard
  if (!SUPER_ADMINS.includes(user?.email)) {
    navigate('/')
    return null
  }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No session')

      const res  = await fetch('/api/admin-data', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const featuresRes = await res.json()
      const { clubs: clubData, users: userData, memberships: memberData, sessions: sessionData, matchCount } = featuresRes

      const enrichedClubs = clubData.map(c => ({
        ...c,
        memberCount:   memberData.filter(m => m.club_id === c.id && m.status === 'approved').length,
        sessionCount:  sessionData.filter(s => s.club_id === c.id).length,
        memberUserIds: memberData.filter(m => m.club_id === c.id && m.status === 'approved').map(m => m.user_id),
      }))

      const enrichedUsers = userData.map(u => ({
        ...u,
        clubs: memberData
          .filter(m => m.user_id === u.id && m.status === 'approved')
          .map(m => clubData.find(c => c.id === m.club_id)?.name)
          .filter(Boolean),
      }))

      setFeatures(featuresRes?.features || [])
      setClubs(enrichedClubs)
      setUsers(enrichedUsers)
      setSessions(sessionData.slice(0, 30))
      setStats({
        clubs:    clubData.length,
        users:    userData.length,
        sessions: sessionData.length,
        matches:  matchCount,
      })
    } catch (e) {
      setError('Failed to load data: ' + e.message)
    }
    setLoading(false)
  }

  async function toggleUnlocked(clubId, feature, currentVal) {
    await supabase.from('club_features').upsert(
      { club_id: clubId, feature, unlocked: !currentVal },
      { onConflict: 'club_id,feature' }
    )
    setFeatures(prev => {
      const existing = prev.find(f => f.club_id === clubId && f.feature === feature)
      if (existing) return prev.map(f => f.club_id === clubId && f.feature === feature ? { ...f, unlocked: !currentVal } : f)
      return [...prev, { club_id: clubId, feature, unlocked: !currentVal, enabled: false }]
    })
  }

  async function sendBroadcast() {
    if (!broadcastTitle.trim()) return
    setSending(true)
    let userIds = []
    if (broadcastTarget === 'all') {
      userIds = users.map(u => u.id)
    } else {
      const club = clubs.find(c => c.id === broadcastTarget)
      userIds = club?.memberUserIds || []
    }
    await sendPush(userIds, broadcastTitle.trim(), broadcastBody.trim(), '/')
    setBroadcastTitle('')
    setBroadcastBody('')
    setSending(false)
    setBroadcastToast(`📣 Sent to ${userIds.length} users`)
    setTimeout(() => setBroadcastToast(''), 3000)
  }

  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  )

  function fmt(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  const [deletionRequests, setDeletionRequests] = useState([])

  async function fetchDeletionRequests() {
    const { data } = await supabase
      .from('account_deletion_requests')
      .select('*')
      .order('created_at', { ascending: false })
    setDeletionRequests(data || [])
  }

  async function markDeletionDone(id) {
    await supabase.from('account_deletion_requests').update({ status: 'completed' }).eq('id', id)
    fetchDeletionRequests()
  }

  async function confirmDelete(request) {
    if (!confirm(`Permanently delete auth user ${request.email}? This cannot be undone.`)) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId: request.user_id, requestId: request.id })
    })
    const data = await res.json()
    if (data.success) {
      fetchDeletionRequests()
    } else {
      alert('Error: ' + (data.error || 'Unknown error'))
    }
  }

  useEffect(() => { if (tab === 'deletions') fetchDeletionRequests() }, [tab])

  const TABS = ['clubs', 'users', 'activity', 'broadcast', 'deletions']

  return (
    <div className="page" style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* Topnav */}
      <div className="topnav">
        <div>
          <span className="topnav-logo">⚡ Admin</span>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, letterSpacing: '0.04em', marginTop: 1 }}>
            Shuttley Super Admin
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← App</button>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="content">

        {loading && <div style={{ color: 'var(--text3)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>}

        {error && (
          <div style={{
            background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)',
            borderRadius: 12, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#ff6b6b'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Stats bar ── */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 28 }}>
            {[
              ['Clubs',    stats.clubs,    '🏸'],
              ['Users',    stats.users,    '👥'],
              ['Sessions', stats.sessions, '📅'],
              ['Matches',  stats.matches,  '🏆'],
            ].map(([label, val, icon]) => (
              <div key={label} className="card" style={{ textAlign: 'center', padding: '16px 8px' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 18px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: tab === t ? 'none' : '1px solid var(--border)',
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--text2)',
            }}>
              {t === 'broadcast' ? '📣 Broadcast' : t === 'deletions' ? `🗑 Deletions${deletionRequests.filter(d => d.status === 'pending').length ? ` (${deletionRequests.filter(d => d.status === 'pending').length})` : ''}` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── CLUBS TAB ── */}
        {tab === 'clubs' && !loading && (
          <div>
            <div className="section-label">{clubs.length} clubs</div>
            {clubs.length === 0 && (
              <div className="empty"><p>No clubs found.<br/>Check RLS policies in Supabase.</p></div>
            )}
            {clubs.map(c => (
              <div key={c.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{c.name}</div>
                    {c.description && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{c.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                        📅 {fmt(c.created_at)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{c.memberCount} members</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{c.sessionCount} sessions</span>
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                      {FEATURES.map(feature => {
                        const f = features.find(x => x.club_id === c.id && x.feature === feature)
                        const unlocked = f?.unlocked || false
                        return (
                          <button key={feature} onClick={() => toggleUnlocked(c.id, feature, unlocked)} style={{
                            padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer',
                            border:'none',
                            background: unlocked ? 'rgba(42,140,85,0.15)' : 'var(--bg3)',
                            color: unlocked ? '#2a8c55' : 'var(--text3)',
                          }}>
                            {feature === 'splits' ? '💰' : '💬'} {feature} {unlocked ? '✓ ON' : 'OFF'}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ width: 'auto' }}
                      onClick={() => navigate(`/club/${c.id}/mod`)}>
                      Enter as Mod →
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {fmt(c.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── USERS TAB ── */}
        {tab === 'users' && !loading && (
          <div>
            <div className="input-wrap" style={{ marginBottom: 16 }}>
              <input
                className="input"
                placeholder="Search by name or email…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
              />
            </div>
            <div className="section-label">{filteredUsers.length} users</div>
            {filteredUsers.length === 0 && <div className="empty"><p>No users found.</p></div>}
            {filteredUsers.map(u => (
              <div key={u.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--accent-dim)', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                          {(u.full_name || u.email || '?')[0].toUpperCase()}
                        </span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{u.full_name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: u.clubs.length ? 4 : 0 }}>{u.email}</div>
                    {u.clubs.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {u.clubs.map(name => (
                          <span key={name} style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                            background: 'var(--accent-dim)', color: 'var(--accent)',
                          }}>{name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {fmt(u.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab === 'activity' && !loading && (
          <div>
            <div className="section-label">Last 30 sessions (all clubs)</div>
            {sessions.length === 0 && <div className="empty"><p>No sessions found.</p></div>}
            {sessions.map(s => (
              <div key={s.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                      {clubs.find(c => c.id === s.club_id)?.name || 'Unknown club'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {s.name || 'Session'} · {s.match_type || 'doubles'} ·{' '}
                      <span style={{ color: s.status === 'active' ? 'var(--accent)' : 'var(--text3)' }}>
                        {s.status === 'active' ? '🟢 Live' : '✅ Ended'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {fmt(s.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── BROADCAST TAB ── */}
        {tab === 'broadcast' && !loading && (
          <div>
            <div className="section-label">Send push notification</div>
            <div className="card" style={{ marginBottom: 20 }}>

              <div className="input-wrap">
                <label className="input-label">Target</label>
                <select className="input" value={broadcastTarget} onChange={e => setBroadcastTarget(e.target.value)}>
                  <option value="all">🌐 All users ({users.length})</option>
                  {clubs.map(c => (
                    <option key={c.id} value={c.id}>🏸 {c.name} ({c.memberCount} members)</option>
                  ))}
                </select>
              </div>

              <div className="input-wrap">
                <label className="input-label">Title</label>
                <input className="input" placeholder="e.g. Shuttley Update"
                  value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} />
              </div>

              <div className="input-wrap" style={{ marginBottom: 16 }}>
                <label className="input-label">Message</label>
                <input className="input" placeholder="e.g. New feature available — check it out!"
                  value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)} />
              </div>

              <button className="btn btn-primary"
                disabled={!broadcastTitle.trim() || sending}
                onClick={sendBroadcast}>
                {sending ? 'Sending…' : '📣 Send Notification'}
              </button>

              {broadcastToast && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  fontSize: 13, fontWeight: 600, textAlign: 'center',
                }}>
                  {broadcastToast}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DELETIONS TAB ── */}
        {tab === 'deletions' && (
          <div>
            <div className="section-label">{deletionRequests.length} deletion requests</div>
            {deletionRequests.length === 0 && <div className="empty"><p>No deletion requests.</p></div>}
            {deletionRequests.map(d => (
              <div key={d.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{d.anonymised_name || d.email}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{d.email} · {fmt(d.created_at)}</div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: d.status === 'completed' ? 'var(--success-dim)' : 'var(--danger-dim)',
                      color: d.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                    }}>{d.status === 'completed' ? '✓ Completed' : '⏳ Pending'}</span>
                  </div>
                  {d.status === 'pending' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => confirmDelete(d)}
                        className="btn btn-danger btn-sm"
                        style={{ fontSize: 12 }}>
                        🗑 Confirm Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
