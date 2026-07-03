import { useNavigate } from 'react-router-dom'

const IconHome = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--accent)' : 'var(--text2)'}
    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
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

const IconSession = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--accent)' : 'var(--text2)'}
    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M10 8l6 4-6 4V8z" strokeLinejoin="round"/>
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

const IconSplits = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke={active ? 'var(--accent)' : 'var(--text2)'}
    strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h12c1 0 2 1 2 2v14c0 1-1 2-2 2H6c-1 0-2-1-2-2V5c0-1 1-2 2-2z"/>
    <line x1="9" y1="7" x2="15" y2="7"/>
    <line x1="9" y1="11" x2="15" y2="11"/>
    <line x1="9" y1="15" x2="13" y2="15"/>
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
    { id: 'home',    label: 'Home',    Icon: IconHome,    action: () => navigate('/') },
    { id: 'polls',   label: 'Polls',   Icon: IconPolls,   action: () => navigate(`${dashPath}?tab=polls`) },
    { id: 'session', label: 'Session', Icon: IconSession, action: () => navigate(`${dashPath}?tab=session`) },
    { id: 'stats',   label: 'Stats',   Icon: IconStats,   action: () => navigate(`/club/${clubId}/matches?tab=stats`) },
    { id: 'splits',  label: 'Splits',  Icon: IconSplits,  action: () => navigate(`/club/${clubId}/splits`) },
    { id: 'more',    label: 'More',    Icon: IconMore,    action: () => navigate(`${dashPath}?tab=more`) },
  ]

  return (
    <div className="tabbar tabbar-group">
      {tabs.map(t => {
        const active = activeTab === t.id
        return (
          <button key={t.id} className={`tab ${active ? 'active' : ''}`} onClick={t.action}>
            <t.Icon active={active} />
            <span style={{ fontWeight: active ? 600 : 400, fontSize: 10, marginTop: 2 }}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
