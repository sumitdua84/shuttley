import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

export default function GroupsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('memberships')
      .select('club_id, role, clubs(id, name)')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .then(({ data }) => {
        setMemberships(data || [])
        setLoading(false)
      })
  }, [user])

  return (
    <div className="page">
      <div className="topnav">
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
          My Groups
        </span>
        <button
          onClick={() => navigate('/groups')}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-sm)', padding: '6px 14px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Inter',sans-serif",
          }}>
          + Join
        </button>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
        ) : memberships.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🏸</div>
            <p>You haven't joined any groups yet.</p>
            <button className="btn btn-primary" onClick={() => navigate('/groups')} style={{ marginTop: 12 }}>
              Find a group
            </button>
          </div>
        ) : (
          <div style={{
            background: 'var(--bg2)', border: '0.5px solid var(--border)',
            borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}>
            {memberships.map((mem, idx) => {
              const dashPath = mem.role === 'moderator'
                ? `/club/${mem.club_id}/mod?tab=session`
                : `/club/${mem.club_id}/member?tab=session`
              const isLast = idx === memberships.length - 1
              return (
                <div key={mem.club_id}>
                  <div
                    onClick={() => navigate(dashPath)}
                    style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: 'var(--text)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {mem.clubs?.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        {mem.role === 'moderator' ? 'Moderator' : 'Member'}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                  </div>
                  {!isLast && <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 16 }} />}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav activeTab="groups" />
    </div>
  )
}
