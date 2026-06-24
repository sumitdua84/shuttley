import { useNavigate } from 'react-router-dom'

const IconSession = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--accent)' : 'var(--text2)'}
    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M10 8l6 4-6 4V8z" strokeLinejoin="round"/>
  </svg>
)

const IconStats = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--accent)' : 'var(--text2)'}
    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="12" width="4" height="9" rx="1"/>
    <rect x="10" y="7" width="4" height="14" rx="1"/>
    <rect x="17" y="3" width="4" height="18" rx="1"/>
  </svg>
)

const IconPolls = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--accent)' : 'var(--text2)'}
    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <path d="M7 12l3 3 7-7"/>
  </svg>
)

const IconChat = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--accent)' : 'var(--text2)'}
    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const IconMore = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="5"  cy="12" r="1.8" fill={active ? 'var(--accent)' : 'var(--text2)'}/>
    <circle cx="12" cy="12" r="1.8" fill={active ? 'var(--accent)' : 'var(--text2)'}/>
    <circle cx="19" cy="12" r="1.8" fill={active ? 'var(--accent)' : 'var(--text2)'}/>
  </svg>
)

export default function GroupNav({ clubId, isMod, activeTab }) {
  const navigate = useNavigate()
  const dashPath = isMod ? `/club/${clubId}/mod` : `/club/${clubId}/member`

  const tabs = [
    { id: 'session', label: 'Session', Icon: IconSession, action: () => navigate(dashPath) },
    { id: 'stats',   label: 'Stats',   Icon: IconStats,   action: () => navigate(`/club/${clubId}/matches`) },
    { id: 'polls',   label: 'Polls',   Icon: IconPolls,   action: () => navigate(`${dashPath}?tab=polls`) },
    { id: 'chat',    label: 'Chat',    Icon: IconChat,    action: () => navigate(`/club/${clubId}/chat`) },
    { id: 'more',    label: 'More',    Icon: IconMore,    action: () => navigate(`${dashPath}?tab=more`) },
  ]

  return (
    <div className="tabbar">
      {tabs.map(t => {
        const active = activeTab === t.id
        return (
          <button key={t.id} className={`tab ${active ? 'active' : ''}`} onClick={t.action}>
            <t.Icon active={active} />
            <span style={{ fontWeight: active ? 600 : 400, fontSize: 11, marginTop: 2 }}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
