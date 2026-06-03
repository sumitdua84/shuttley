import { useNavigate } from 'react-router-dom'

// Shuttley shuttlecock logo for Clubs tab
const IconClubs = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    {/* Shuttlecock base */}
    <ellipse cx="12" cy="18" rx="4" ry="2.5"/>
    {/* Cork */}
    <circle cx="12" cy="15" r="1.5"/>
    {/* Feathers */}
    <line x1="12" y1="13.5" x2="8"  y2="5"/>
    <line x1="12" y1="13.5" x2="10" y2="4"/>
    <line x1="12" y1="13.5" x2="12" y2="3.5"/>
    <line x1="12" y1="13.5" x2="14" y2="4"/>
    <line x1="12" y1="13.5" x2="16" y2="5"/>
    {/* Feather tips connected */}
    <path d="M8 5 Q10 4 12 3.5 Q14 4 16 5"/>
  </svg>
)

// House icon for Home tab
const IconHome = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
  </svg>
)

const IconStats = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
  </svg>
)

const IconMe = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)

export default function BottomNav({ clubId, activeTab }) {
  const navigate = useNavigate()

  const tabs = [
    { id: 'clubs', label: 'Clubs', Icon: IconClubs, action: () => navigate('/') },
    { id: 'home',  label: 'Home',  Icon: IconHome,  action: () => clubId && navigate(`/club/${clubId}/member`) },
    { id: 'stats', label: 'Stats', Icon: IconStats, action: () => clubId && navigate(`/club/${clubId}/matches?tab=stats`) },
    { id: 'me',    label: 'Me',    Icon: IconMe,    action: () => navigate(clubId ? `/profile?clubId=${clubId}` : '/profile') },
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
