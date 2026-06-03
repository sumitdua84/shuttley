import { useNavigate } from 'react-router-dom'

const IconClubs = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {active
      ? <path fillRule="evenodd" clipRule="evenodd" d="M12 2L2 9.5V21a1 1 0 0 0 1 1h6v-7h6v7h6a1 1 0 0 0 1-1V9.5L12 2z" fill="var(--accent)"/>
      : <>
          <path d="M2 9.5L12 2l10 7.5V21a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5z" stroke="var(--text2)" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M9 22V15h6v7" stroke="var(--text2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </>
    }
  </svg>
)

const IconShuttle = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {active
      ? <path fillRule="evenodd" clipRule="evenodd" d="M6.5 3a1.5 1.5 0 0 0-1.06.44l-2 2a1.5 1.5 0 0 0 0 2.12l3 3-1.5 1.5a1 1 0 0 0 0 1.41l6.59 6.59a1 1 0 0 0 1.41 0l1.5-1.5 3 3a1.5 1.5 0 0 0 2.12 0l2-2a1.5 1.5 0 0 0 0-2.12l-3-3 1.06-1.06a3 3 0 0 0 0-4.24l-3.88-3.88A3 3 0 0 0 13.5 3H6.5z" fill="var(--accent)"/>
      : <path d="M6.5 3h7a3 3 0 0 1 2.12.88l3.88 3.88a3 3 0 0 1 0 4.24L18.44 13l2.5 2.5a1.5 1.5 0 0 1 0 2.12l-2 2a1.5 1.5 0 0 1-2.12 0L14 17l-1.5 1.5a1 1 0 0 1-1.41 0L4.5 11.91a1 1 0 0 1 0-1.41L6 9 3.44 6.44a1.5 1.5 0 0 1 0-2.12l2-2A1.5 1.5 0 0 1 6.5 3z" stroke="var(--text2)" strokeWidth="1.8" strokeLinejoin="round"/>
    }
  </svg>
)

const IconStats = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {active
      ? <>
          <rect x="4" y="13" width="4" height="8" rx="1" fill="var(--accent)"/>
          <rect x="10" y="8" width="4" height="13" rx="1" fill="var(--accent)"/>
          <rect x="16" y="3" width="4" height="18" rx="1" fill="var(--accent)"/>
        </>
      : <>
          <rect x="4" y="13" width="4" height="8" rx="1" stroke="var(--text2)" strokeWidth="1.8"/>
          <rect x="10" y="8" width="4" height="13" rx="1" stroke="var(--text2)" strokeWidth="1.8"/>
          <rect x="16" y="3" width="4" height="18" rx="1" stroke="var(--text2)" strokeWidth="1.8"/>
        </>
    }
  </svg>
)

const IconMe = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {active
      ? <>
          <circle cx="12" cy="7" r="4" fill="var(--accent)"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M4 19c0-3.87 3.58-7 8-7s8 3.13 8 7v1H4v-1z" fill="var(--accent)"/>
        </>
      : <>
          <circle cx="12" cy="7" r="4" stroke="var(--text2)" strokeWidth="1.8"/>
          <path d="M4 20c0-3.87 3.58-7 8-7s8 3.13 8 7" stroke="var(--text2)" strokeWidth="1.8" strokeLinecap="round"/>
        </>
    }
  </svg>
)

export default function BottomNav({ clubId, activeTab }) {
  const navigate = useNavigate()

  const tabs = [
    { id: 'clubs', label: 'Clubs', Icon: IconClubs,   action: () => navigate('/') },
    { id: 'home',  label: 'Home',  Icon: IconShuttle, action: () => clubId && navigate(`/club/${clubId}/member`) },
    { id: 'stats', label: 'Stats', Icon: IconStats,   action: () => clubId && navigate(`/club/${clubId}/matches?tab=stats`) },
    { id: 'me',    label: 'Me',    Icon: IconMe,      action: () => navigate(clubId ? `/profile?clubId=${clubId}` : '/profile') },
  ]

  return (
    <div className="tabbar">
      {tabs.map(t => {
        const active = activeTab === t.id
        return (
          <button key={t.id} className={`tab ${active ? 'active' : ''}`} onClick={t.action}>
            <t.Icon active={active} />
            <span style={{ fontWeight: active ? 600 : 400, fontSize: 11, marginTop: 3, color: active ? 'var(--accent)' : 'var(--text2)' }}>
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
