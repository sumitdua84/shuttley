import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const ChevronDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6"/>
  </svg>
)

function buildTargetRoute(targetClubId, targetIsMod, activeTab) {
  const dashPath = targetIsMod ? `/club/${targetClubId}/mod` : `/club/${targetClubId}/member`
  if (activeTab === 'stats') return `/club/${targetClubId}/matches?tab=stats`
  if (activeTab === 'chat')  return `/club/${targetClubId}/chat`
  const safeTab = ['session', 'polls', 'more'].includes(activeTab) ? activeTab : 'session'
  return `${dashPath}?tab=${safeTab}`
}

export default function GroupWorldHeader({ clubId, groupName, isMod, activeTab, subLabel, buildRoute }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [otherGroups, setOtherGroups] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('memberships')
      .select('club_id, role, clubs(name)')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .then(({ data }) => {
        if (data) setOtherGroups(data.filter(m => m.club_id !== clubId))
      })
  }, [user, clubId])

  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const hasMultiple = otherGroups.length > 0
  const secondLine = subLabel ?? (isMod ? 'Moderator' : 'Member')

  function switchTo(m) {
    setOpen(false)
    const route = buildRoute
      ? buildRoute(m.club_id, m.role)
      : buildTargetRoute(m.club_id, m.role === 'moderator', activeTab)
    navigate(route)
  }

  return (
    <div ref={wrapRef} style={{ width: '100%', textAlign: 'center', position: 'relative' }}>
      {/* Group name row */}
      <button
        onClick={() => hasMultiple && setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', padding: 0,
          cursor: hasMultiple ? 'pointer' : 'default',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          color: 'var(--text)',
        }}
      >
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 16, fontWeight: 700 }}>
          {groupName}
        </span>
        {hasMultiple && (
          <span style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center', marginTop: 1 }}>
            <ChevronDown />
          </span>
        )}
      </button>

      {/* Role / sub-label */}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{secondLine}</div>

      {/* Group switcher dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          minWidth: 200, zIndex: 100, overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 0' }}>
            <div style={{
              fontSize: 10, color: 'var(--text3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              padding: '6px 16px 8px',
            }}>
              Switch Group
            </div>
            {otherGroups.map(m => (
              <button
                key={m.club_id}
                onClick={() => switchTo(m)}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {m.clubs?.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {m.role === 'moderator' ? 'Moderator' : 'Member'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
