import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function OnboardingPage() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home') // home | search | create
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [clubName, setClubName] = useState('')
  const [clubDesc, setClubDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchMemberships() }, [user])

  async function fetchMemberships() {
    const { data, error } = await supabase
      .from('memberships')
      .select('id, user_id, club_id, role, status, joined_at, clubs(*)')
      .eq('user_id', user.id)
    if (error) console.error('Memberships error:', error)
    console.log('My memberships:', JSON.stringify(data, null, 2))
    setMemberships(data || [])
    setLoading(false)
  }

  async function searchClubs(q) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    const { data } = await supabase
      .from('clubs')
      .select('*, profiles!clubs_created_by_fkey(full_name)')
      .ilike('name', `%${q}%`)
      .limit(10)
    setSearchResults(data || [])
  }

  async function requestJoin(club) {
    const existing = memberships.find(m => m.club_id === club.id)
    if (existing) { showToast('Already a member or pending'); return }
    const { error } = await supabase.from('memberships').insert({
      user_id: user.id, club_id: club.id, role: 'member', status: 'pending'
    })
    if (!error) { showToast('Join request sent!'); fetchMemberships(); setView('home') }
  }

  async function createClub() {
    if (!clubName.trim()) return
    setCreating(true)
    const { data: club, error } = await supabase
      .from('clubs')
      .insert({ name: clubName.trim(), description: clubDesc.trim(), created_by: user.id })
      .select().single()
    if (error) { setCreating(false); showToast('Error creating club'); return }
    await supabase.from('memberships').insert({
      user_id: user.id, club_id: club.id, role: 'moderator', status: 'approved'
    })
    setCreating(false)
    showToast('Club created!')
    fetchMemberships()
    setView('home')
    setClubName(''); setClubDesc('')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const name = profile?.full_name || user?.email?.split('@')[0] || 'there'
  const avatar = profile?.avatar_url

  return (
    <div className="page">
      <div className="topnav">
        <span className="topnav-logo">Shuttley</span>
        <button className="avatar-btn" onClick={signOut} title="Sign out">
          {avatar
            ? <img src={avatar} alt="avatar" />
            : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--accent)',fontSize:14,fontWeight:600 }}>{name[0].toUpperCase()}</div>
          }
        </button>
      </div>

      <div className="content">
        {view === 'home' && <>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, letterSpacing: '-0.5px', marginBottom: 4 }}>
              Hey, {name.split(' ')[0]} 👋
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Your clubs are below</p>
          </div>

          {/* My clubs */}
          {loading ? (
            <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
          ) : memberships.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>No clubs yet.<br />Join or create one below.</p>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">My clubs</div>
              {memberships.map(m => (
                <div key={m.id} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: m.status === 'approved' ? 12 : 0 }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 6 }}>{m.clubs?.name}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`badge badge-${m.status}`}>{m.status}</span>
                        {m.role === 'moderator' && <span className="badge badge-mod">⭐ moderator</span>}
                      </div>
                    </div>
                  </div>
                  {m.status === 'pending' && (
                    <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                      Waiting for moderator approval
                    </p>
                  )}
                  {m.status === 'approved' && m.role === 'moderator' && (
                    <button className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/club/${m.club_id}/mod`)}>
                      ⚙️ Open Moderator Dashboard
                    </button>
                  )}
                  {m.status === 'approved' && m.role === 'member' && (
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/club/${m.club_id}/member`)}>
                      View My Sessions →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-primary" onClick={() => setView('search')}>
              🔍 Search for a club
            </button>
            <button className="btn btn-secondary" onClick={() => setView('create')}>
              ✦ Create a new club
            </button>
          </div>
        </>}

        {view === 'search' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('home'); setSearchQuery(''); setSearchResults([]) }}>← Back</button>
            <h2 style={{ fontSize: 22 }}>Find a club</h2>
          </div>
          <div className="input-wrap">
            <input className="input" placeholder="Search by club name…" value={searchQuery}
              onChange={e => searchClubs(e.target.value)} autoFocus />
          </div>
          {searchResults.length === 0 && searchQuery.length >= 2 && (
            <div className="empty"><p>No clubs found for "{searchQuery}"</p></div>
          )}
          {searchResults.map(club => (
            <div key={club.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 2 }}>{club.name}</div>
                {club.description && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{club.description}</div>}
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  Moderator: {club.profiles?.full_name || 'Unknown'}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => requestJoin(club)}>
                Request to join
              </button>
            </div>
          ))}
        </>}

        {view === 'create' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setView('home')}>← Back</button>
            <h2 style={{ fontSize: 22 }}>New club</h2>
          </div>
          <div className="input-wrap">
            <label className="input-label">Club name</label>
            <input className="input" placeholder="e.g. Tuesday Smashers" value={clubName}
              onChange={e => setClubName(e.target.value)} />
          </div>
          <div className="input-wrap">
            <label className="input-label">Description (optional)</label>
            <input className="input" placeholder="What's this club about?" value={clubDesc}
              onChange={e => setClubDesc(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={createClub} disabled={!clubName.trim() || creating}
            style={{ marginTop: 8, opacity: (!clubName.trim() || creating) ? 0.5 : 1 }}>
            {creating ? 'Creating…' : 'Create club'}
          </button>
        </>}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
