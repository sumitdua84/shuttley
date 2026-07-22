import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { useConfirm } from '../hooks/useConfirm'
import BottomNav from '../components/BottomNav'
import { getNotificationPermissionStatus, usePushNotifications } from '../hooks/usePushNotifications'

const SUPER_ADMINS = ['sumit@shuttley.club', 'sumitdua84@gmail.com']

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
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notifStatus, setNotifStatus] = useState(() => getNotificationPermissionStatus())
  const [notifPrefs, setNotifPrefs] = useState({ session_poll_notifications: true })
  const [savingNotif, setSavingNotif] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmDialog, confirmModal] = useConfirm()
  const { subscribe, saveNotificationPreference } = usePushNotifications()
  const fileRef = useRef()

  useEffect(() => { fetchProfile() }, [user])

  async function fetchProfile() {
    if (!user) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)
    setFullName(p?.full_name || '')
    setNotifStatus(getNotificationPermissionStatus())

    const { data: prefs } = await supabase
      .from('user_notification_preferences')
      .select('session_poll_notifications')
      .eq('user_id', user.id)
      .maybeSingle()
    if (prefs) setNotifPrefs(prefs)

    if (clubId) {
      const { data: mem } = await supabase.from('memberships').select('role').eq('club_id', clubId).eq('user_id', user.id).single()
      setIsModerator(mem?.role === 'moderator')
      const { data: c } = await supabase.from('clubs').select('*').eq('id', clubId).single()
      setClub(c)
    }
  }

  async function saveProfile() {
    setSaving(true)
    const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: fullName })
    if (error) {
      setSaving(false)
      console.error('saveProfile error:', error)
      showToast('Error: ' + error.message)
      return
    }
    await supabase.auth.updateUser({ data: { full_name: fullName } })
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
    if (!(await confirmDialog('Sign out?'))) return
    await signOut()
    navigate('/login')
  }

  async function enableNotifications() {
    setSavingNotif(true)
    const ok = await subscribe(user.id)
    const nextStatus = getNotificationPermissionStatus()
    setNotifStatus(ok ? 'granted' : nextStatus)
    if (ok) {
      await saveNotificationPreference(user.id, { session_poll_notifications: true })
      setNotifPrefs(prev => ({ ...prev, session_poll_notifications: true }))
      showToast('Notifications enabled')
    } else {
      showToast(nextStatus === 'denied' ? 'Notifications are blocked in settings' : 'Could not enable notifications')
    }
    setSavingNotif(false)
  }

  async function toggleSessionPollNotifications() {
    const next = !notifPrefs.session_poll_notifications
    setSavingNotif(true)
    if (next && getNotificationPermissionStatus() !== 'granted') {
      const ok = await subscribe(user.id)
      setNotifStatus(getNotificationPermissionStatus())
      if (!ok) {
        setSavingNotif(false)
        showToast('Enable device notifications first')
        return
      }
    }

    const { error } = await saveNotificationPreference(user.id, { session_poll_notifications: next })
    if (!error) {
      setNotifPrefs(prev => ({ ...prev, session_poll_notifications: next }))
      showToast(next ? 'Poll notifications on' : 'Poll notifications off')
    } else {
      showToast('Could not save notification setting')
    }
    setSavingNotif(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const avatarUrl = profile?.avatar_url
  const notificationStatusText =
    notifStatus === 'granted' ? 'Notifications are enabled on this device'
    : notifStatus === 'denied' ? 'Notifications are blocked in your browser or device settings'
    : notifStatus === 'unsupported' ? 'Notifications are not supported on this device'
    : 'Notifications are not enabled on this device'

  return (
    <div className="page">
      <div className="topnav">
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Me</span>
        <div style={{ width: 40 }} />
      </div>

      <div className="content">

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
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveProfile} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setEditing(false); setFullName(profile?.full_name || '') }}>
                  Cancel
                </button>
              </div>
            </>
          ) : null}
        </div>

        {/* Notifications */}
        <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Notifications</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 12 }}>
            {notificationStatusText}
          </div>
          {notifStatus !== 'granted' && notifStatus !== 'unsupported' && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: 12, fontSize: 13 }}
              disabled={savingNotif || notifStatus === 'denied'}
              onClick={enableNotifications}>
              {notifStatus === 'denied' ? 'Blocked in settings' : savingNotif ? 'Enabling...' : 'Enable notifications'}
            </button>
          )}
          <button
            type="button"
            onClick={toggleSessionPollNotifications}
            disabled={savingNotif || notifStatus === 'unsupported'}
            style={{
              width: '100%', padding: '12px 0', background: 'none', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: savingNotif || notifStatus === 'unsupported' ? 'default' : 'pointer'
            }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Poll notifications</span>
            <span style={{
              width: 44, height: 24, borderRadius: 999, padding: 2,
              background: notifPrefs.session_poll_notifications ? 'var(--accent)' : 'var(--border2)',
              transition: 'background 0.15s ease'
            }}>
              <span style={{
                display: 'block', width: 20, height: 20, borderRadius: '50%',
                background: '#fff',
                transform: notifPrefs.session_poll_notifications ? 'translateX(20px)' : 'translateX(0)',
                transition: 'transform 0.15s ease'
              }} />
            </span>
          </button>
        </div>

        {/* Moderator / Admin settings */}
        {isModerator && club && (
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Group Settings — {club.name}</div>

            <button
              className="btn btn-danger"
              style={{ width: '100%', marginTop: 14, fontSize: 13 }}
              onClick={async () => {
                if (await confirmDialog('Send a request to delete this group? This action will be reviewed.')) {
                  showToast('Delete request sent')
                }
              }}>
              🗑 Request to Delete Group
            </button>
          </div>
        )}

        {/* Super-admin link */}
        {SUPER_ADMINS.includes(user?.email) && (
          <div
            onClick={() => navigate('/admin')}
            style={{
              background: 'var(--bg2)', borderRadius: 'var(--radius)',
              padding: '14px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
            }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Admin Dashboard</span>
            <span style={{ fontSize: 16, color: 'var(--text3)' }}>›</span>
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

        {/* Delete account */}
        <button
          onClick={() => navigate('/delete-account')}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', marginTop: 8, textDecoration: 'underline' }}>
          Delete Account
        </button>

      </div>

      <Toast message={toast} />
      {confirmModal}
      <BottomNav activeTab="me" />
    </div>
  )
}
