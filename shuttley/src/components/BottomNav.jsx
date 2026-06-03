import { useNavigate, useLocation } from 'react-router-dom'

const ICONS = {
  clubs: '🏠',
  home:  '🏸',
  stats: '📊',
  me:    '👤',
}

export default function BottomNav({ clubId, activeTab }) {
  const navigate = useNavigate()

  const tabs = [
    { id: 'clubs', label: 'Clubs',  icon: ICONS.clubs, action: () => navigate('/') },
    { id: 'home',  label: 'Home',   icon: ICONS.home,  action: () => clubId && navigate(`/club/${clubId}/member`) },
    { id: 'stats', label: 'Stats',  icon: ICONS.stats, action: () => clubId && navigate(`/club/${clubId}/matches?tab=stats`) },
    { id: 'me',    label: 'Me',     icon: ICONS.me,    action: () => navigate(clubId ? `/profile?clubId=${clubId}` : '/profile') },
  ]

  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`tab ${activeTab === t.id ? 'active' : ''}`}
          onClick={t.action}
        >
          <span className="tab-icon">{t.icon}</span>
          <span style={{ fontWeight: activeTab === t.id ? 600 : 400 }}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
