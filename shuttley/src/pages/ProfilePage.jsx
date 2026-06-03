import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('clubId')

  const [profile, setProfile] = useState(null)
  const [isModerator, setIsModerator] = useState(false)
  const [club, setClub] = useState(null)
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [alias, setAlias] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef()

  useEffect(() => { fetchProfile() }, [user])

  async function fetchProfile() {
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)
    setFullName(p?.full_name || '')
    setAlias(p?.alias || '')

    if (clubId) {
      const { data: mem } = await supabase.from('memberships').select('role').eq('club_id', clubId).eq('user_id', user.id).single()
      setIsModerator(mem?.role === 'moderator')
      const { data: c } = await supabase.from('clubs').select('*').eq('id', clubId).single()
      setClub(c)
    }
  }

  async function saveProfile() {
    setSaving(true)
    await supabase.from('profiles').update({ full_name: fullName, alias }).eq('id', user.id)
    setSaving(false)
    setEditing(false)
    showToast('Profile saved')
    fetchProfile()
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) { showToast('Upload failed'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl + '?t=' + Date.now() }).eq('id', user.id)
    setUploading(false)
    showToast('Photo updated')
    fetchProfile()
  }

  async function handleSignOut() {
    if (!confirm('Sign out?')) return
    await signOut()
    navigate('/login')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const avatarUrl = profile?.avatar_url

  return (
    <div className="page">
      <div className="topnav">
        <div style={{ width: 40 }} />
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18 }}>Me</span>
        <div style={{ width: 40 }} />
      </div>

      <div className="content" style={{ paddingBottom: 90 }}>

        {/* Avatar + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0 20px' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'var(--accent-dim)', border: '2px solid var(--border2)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
              }
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--accent)', border: '2px solid white',
                color: 'white', fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
              {uploading ? '…' : '📷'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{profile?.full_name || 'No name'}</div>
          {profile?.alias && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>"{profile.alias}"</div>}
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{user?.email}</div>
        </div>

        {/* Edit profile */}
        <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editing ? 12 : 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Personal Details</span>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
            )}
          </div>
          {editing ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Full Name</label>
                <input
                  className="input"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Alias (shown in app)</label>
                <input
                  className="input"
                  value={alias}
                  onChange={e => setAlias(e.target.value)}
                  placeholder="e.g. Smash King"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveProfile} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setEditing(false); setFullName(profile?.full_name || ''); setAlias(profile?.alias || '') }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              {profile?.alias ? `Alias: ${profile.alias}` : 'No alias set'}
            </div>
          )}
        </div>

        {/* Moderator / Admin settings */}
        {isModerator && club && (
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Club Settings — {club.name}</div>

            {[
              { key: 'splits_enabled',        label: 'Splits',        icon: '💰' },
              { key: 'chat_enabled',           label: 'Chat',          icon: '💬' },
              { key: 'notifications_enabled',  label: 'Notifications', icon: '🔔' },
            ].map(({ key, label, icon }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontSize: 14, color: 'var(--text)' }}>{label}</span>
                </div>
                <div
                  onClick={async () => {
                    const newVal = !club[key]
                    await supabase.from('clubs').update({ [key]: newVal }).eq('id', clubId)
                    setClub(prev => ({ ...prev, [key]: newVal }))
                  }}
                  style={{
                    width: 44, height: 26, borderRadius: 99, cursor: 'pointer',
                    background: club[key] ? 'var(--accent)' : 'var(--border2)',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0
                  }}>
                  <div style={{
                    position: 'absolute', top: 3,
                    left: club[key] ? 19 : 3,
                    width: 20, height: 20, borderRadius: 99,
                    background: '#fff', transition: 'left 0.2s'
                  }} />
                </div>
              </div>
            ))}

            <button
              className="btn btn-danger"
              style={{ width: '100%', marginTop: 14, fontSize: 13 }}
              onClick={() => {
                if (confirm('Send a request to delete this club? This action will be reviewed.')) {
                  showToast('Delete request sent')
                }
              }}>
              🗑 Request to Delete Club
            </button>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            width: '100%', padding: '14px', borderRadius: 'var(--radius)',
            background: 'var(--danger-dim)', border: 'none',
            color: 'var(--danger)', fontSize: 14, fontWeight: 600, cursor: 'pointer'
          }}>
          Sign Out
        </button>

      </div>

      {toast && <div className="toast">{toast}</div>}
      <BottomNav clubId={clubId} activeTab="me" />
    </div>
  )
}
