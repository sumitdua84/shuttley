import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

export default function ModeratorDashboard() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [members, setMembers] = useState([])
  const [sessions, setSessions] = useState([])
  const [tab, setTab] = useState('members') // members | sessions | settings
  const [toast, setToast] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [memberAssignments, setMemberAssignments] = useState([])
  const [sessionForm, setSessionForm] = useState({ day_of_week:'monday', start_time:'', location:'', notes:'' })
  const [loading, setLoading] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => { fetchData() }, [clubId])

  async function fetchData() {
    const { data: clubData } = await supabase.from('clubs').select('*').eq('id', clubId).single()
    setClub(clubData)

    const { data: mems } = await supabase
      .from('memberships')
      .select('*, profiles(*)')
      .eq('club_id', clubId)
      .order('joined_at', { ascending: false })
    setMembers(mems || [])

    const { data: sess } = await supabase.from('sessions').select('*').eq('club_id', clubId)
    setSessions(sess || [])
    setLoading(false)
  }

  async function updateMemberStatus(membershipId, status) {
    await supabase.from('memberships').update({ status }).eq('id', membershipId)
    showToast(status === 'approved' ? '✓ Member approved' : '✗ Member rejected')
    fetchData()
  }

  async function promoteMod(membershipId) {
    await supabase.from('memberships').update({ role: 'moderator' }).eq('id', membershipId)
    showToast('Promoted to moderator')
    fetchData()
  }

  async function removeMember(membershipId) {
    if (!confirm('Remove this member from the club?')) return
    await supabase.from('memberships').delete().eq('id', membershipId)
    showToast('Member removed')
    fetchData()
  }

  async function openAssignments(member) {
    setSelectedMember(member)
    const { data } = await supabase
      .from('session_assignments')
      .select('*, sessions(*)')
      .eq('membership_id', member.id)
    setMemberAssignments((data || []).map(a => a.session_id))
  }

  async function toggleAssignment(sessionId) {
    if (!selectedMember) return
    const isAssigned = memberAssignments.includes(sessionId)
    if (isAssigned) {
      await supabase.from('session_assignments')
        .delete()
        .eq('membership_id', selectedMember.id)
        .eq('session_id', sessionId)
      setMemberAssignments(prev => prev.filter(id => id !== sessionId))
    } else {
      await supabase.from('session_assignments')
        .insert({ membership_id: selectedMember.id, session_id: sessionId })
      setMemberAssignments(prev => [...prev, sessionId])
    }
  }

  async function addSession() {
    if (!sessionForm.day_of_week) return
    await supabase.from('sessions').insert({ ...sessionForm, club_id: clubId })
    showToast('Session added')
    setSessionForm({ day_of_week:'monday', start_time:'', location:'', notes:'' })
    fetchData()
  }

  async function deleteSession(sessionId) {
    if (!confirm('Delete this session?')) return
    await supabase.from('sessions').delete().eq('id', sessionId)
    fetchData()
  }

  function copyInviteLink() {
    const link = `${window.location.origin}/join/${club?.invite_code}`
    navigator.clipboard.writeText(link)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
    showToast('Invite link copied!')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  if (loading) return <div className="splash"><div className="splash-logo">S</div></div>

  const pending = members.filter(m => m.status === 'pending')
  const approved = members.filter(m => m.status === 'approved')

  return (
    <div className="page">
      {/* Top nav */}
      <div className="topnav">
        <button onClick={() => navigate('/')} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:22,padding:0 }}>←</button>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17 }}>{club?.name}</div>
          <div style={{ fontSize:11, color:'var(--accent)' }}>Moderator</div>
        </div>
        <button onClick={copyInviteLink} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:20,padding:0 }} title="Copy invite link">
          {linkCopied ? '✓' : '🔗'}
        </button>
      </div>

      {/* Matches shortcut */}
      <div style={{ padding:'10px 20px 0' }}>
        <button className="btn btn-secondary btn-sm"
          onClick={() => navigate(`/club/${clubId}/matches`)}
          style={{ width:'100%', marginBottom:0 }}>
          🏸 Matches &amp; Leaderboard
        </button>
      </div>

      {/* Assign sessions modal */}
      {selectedMember && (
        <div style={{
          position:'fixed',inset:0,zIndex:50,
          background:'rgba(0,0,0,0.8)',
          display:'flex',alignItems:'flex-end',
          maxWidth:430, margin:'0 auto'
        }} onClick={e => e.target === e.currentTarget && setSelectedMember(null)}>
          <div style={{ background:'var(--bg2)', borderRadius:'20px 20px 0 0', padding:24, width:'100%' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:500,fontSize:16 }}>{selectedMember.profiles?.full_name}</div>
                <div style={{ fontSize:12,color:'var(--text2)' }}>Assign session days</div>
              </div>
              <button onClick={() => setSelectedMember(null)} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:24 }}>×</button>
            </div>
            {sessions.length === 0 ? (
              <p style={{ color:'var(--text3)',fontSize:14,textAlign:'center',padding:'20px 0' }}>
                No sessions yet. Add sessions in the Sessions tab first.
              </p>
            ) : (
              <div className="day-grid">
                {sessions.map(s => (
                  <div key={s.id} className={`day-pill ${memberAssignments.includes(s.id) ? 'active' : ''}`}
                    onClick={() => toggleAssignment(s.id)} style={{ cursor:'pointer' }}>
                    {s.day_of_week?.charAt(0).toUpperCase() + s.day_of_week?.slice(1)}
                    {s.start_time ? ` ${s.start_time}` : ''}
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-primary" style={{ marginTop:20 }} onClick={() => { setSelectedMember(null); showToast('Assignments saved') }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="content">

        {tab === 'members' && <>
          {/* Pending */}
          {pending.length > 0 && <>
            <div className="section-label" style={{ color:'#ffc832' }}>
              Pending approval ({pending.length})
            </div>
            {pending.map(m => (
              <div key={m.id} className="card" style={{ marginBottom:10 }}>
                <div className="member-row" style={{ padding:0,border:'none',marginBottom:12 }}>
                  <div className="member-avatar">
                    {m.profiles?.avatar_url
                      ? <img src={m.profiles.avatar_url} alt="" />
                      : <div className="member-avatar-init">{(m.profiles?.full_name||'?')[0]}</div>
                    }
                  </div>
                  <div className="member-info">
                    <div className="member-name">{m.profiles?.full_name || 'Unknown'}</div>
                    <div className="member-meta">{m.profiles?.id?.substring(0,8)}…</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                    onClick={() => updateMemberStatus(m.id, 'approved')}>Approve</button>
                  <button className="btn btn-danger btn-sm" style={{ flex:1 }}
                    onClick={() => updateMemberStatus(m.id, 'rejected')}>Reject</button>
                </div>
              </div>
            ))}
            <hr className="divider" />
          </>}

          {/* Approved */}
          <div className="section-label">Members ({approved.length})</div>
          {approved.length === 0 ? (
            <div className="empty"><p>No approved members yet</p></div>
          ) : approved.map(m => (
            <div key={m.id} className="member-row">
              <div className="member-avatar">
                {m.profiles?.avatar_url
                  ? <img src={m.profiles.avatar_url} alt="" />
                  : <div className="member-avatar-init">{(m.profiles?.full_name||'?')[0]}</div>
                }
              </div>
              <div className="member-info">
                <div className="member-name">{m.profiles?.full_name}</div>
                <div style={{ display:'flex', gap:4, marginTop:2 }}>
                  {m.role === 'moderator' && <span className="badge badge-mod">mod</span>}
                </div>
              </div>
              <div className="member-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => openAssignments(m)}>📅</button>
                {m.role !== 'moderator' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => promoteMod(m.id)} title="Promote to mod">⭐</button>
                )}
                {m.user_id !== user.id && (
                  <button className="btn btn-danger btn-sm" onClick={() => removeMember(m.id)} title="Remove">✕</button>
                )}
              </div>
            </div>
          ))}
        </>}

        {tab === 'sessions' && <>
          <div style={{ marginBottom:20 }}>
            <div className="section-label">Add a session</div>
            <div className="card">
              <div className="input-wrap">
                <label className="input-label">Day</label>
                <select className="input" value={sessionForm.day_of_week}
                  onChange={e => setSessionForm(p => ({...p, day_of_week:e.target.value}))}>
                  {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
                </select>
              </div>
              <div className="input-wrap">
                <label className="input-label">Start time</label>
                <input className="input" type="time" value={sessionForm.start_time}
                  onChange={e => setSessionForm(p => ({...p, start_time:e.target.value}))} />
              </div>
              <div className="input-wrap">
                <label className="input-label">Location</label>
                <input className="input" placeholder="e.g. Sports Hall B" value={sessionForm.location}
                  onChange={e => setSessionForm(p => ({...p, location:e.target.value}))} />
              </div>
              <div className="input-wrap">
                <label className="input-label">Notes (optional)</label>
                <input className="input" placeholder="Any extra info…" value={sessionForm.notes}
                  onChange={e => setSessionForm(p => ({...p, notes:e.target.value}))} />
              </div>
              <button className="btn btn-primary" onClick={addSession}>Add session</button>
            </div>
          </div>

          <div className="section-label">Current sessions</div>
          {sessions.length === 0 ? (
            <div className="empty"><p>No sessions yet</p></div>
          ) : sessions.map(s => (
            <div key={s.id} className="card" style={{ marginBottom:10 }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontWeight:500,fontSize:15,textTransform:'capitalize',marginBottom:4 }}>{s.day_of_week}</div>
                  {s.start_time && <div style={{ fontSize:13,color:'var(--text2)' }}>🕐 {s.start_time}</div>}
                  {s.location && <div style={{ fontSize:13,color:'var(--text2)' }}>📍 {s.location}</div>}
                  {s.notes && <div style={{ fontSize:12,color:'var(--text3)',marginTop:4 }}>{s.notes}</div>}
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => deleteSession(s.id)}>Delete</button>
              </div>
            </div>
          ))}
        </>}

        {tab === 'settings' && <>
          <div className="section-label">Invite link</div>
          <div className="card" style={{ marginBottom:20 }}>
            <p style={{ fontSize:13,color:'var(--text2)',marginBottom:12,lineHeight:1.6 }}>
              Share this link so people can find and request to join your club instantly.
            </p>
            <div style={{ background:'var(--bg3)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text2)',marginBottom:12,wordBreak:'break-all' }}>
              {window.location.origin}/join/{club?.invite_code}
            </div>
            <button className="btn btn-primary" onClick={copyInviteLink}>
              {linkCopied ? '✓ Copied!' : '🔗 Copy invite link'}
            </button>
          </div>

          <div className="section-label">Club info</div>
          <div className="card">
            <div style={{ fontSize:13,color:'var(--text2)',marginBottom:4 }}>Club name</div>
            <div style={{ fontSize:15,fontWeight:500 }}>{club?.name}</div>
            {club?.description && <>
              <div style={{ fontSize:13,color:'var(--text2)',marginTop:12,marginBottom:4 }}>Description</div>
              <div style={{ fontSize:14 }}>{club?.description}</div>
            </>}
          </div>
        </>}
      </div>

      {/* Tab bar */}
      <div className="tabbar">
        {[
          { id:'members', icon:'👥', label:'Members' },
          { id:'sessions', icon:'📅', label:'Sessions' },
          { id:'settings', icon:'⚙️', label:'Settings' },
        ].map(t => (
          <button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}
            style={{ background:'none',border:'none',cursor:'pointer' }}>
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
