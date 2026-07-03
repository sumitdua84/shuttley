import { useNavigate } from 'react-router-dom'

const IconHome = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
  </svg>
)

const IconChat = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const IconGroups = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const IconMe = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text2)'} strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)

export default function BottomNav({ activeTab }) {
  const navigate = useNavigate()

  const tabs = [
    { id: 'home',   label: 'Home',   Icon: IconHome,   action: () => navigate('/') },
    { id: 'chat',   label: 'Chat',   Icon: IconChat,   action: () => navigate('/chat') },
    { id: 'groups', label: 'Groups', Icon: IconGroups, action: () => navigate('/groups') },
    { id: 'me',     label: 'Me',     Icon: IconMe,     action: () => navigate('/profile') },
  ]

  return (
    <div className="tabbar tabbar-global">
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
