import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function ModeratorDashboard() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [members, setMembers] = useState([])
  const [disputedMatches, setDisputedMatches] = useState([])
  const [tab, setTab] = useState('members') // members | disputes | settings
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)
  const [showGuestForm, setShowGuestForm] = useState(false)

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

    const { data: disputed } = await supabase
      .from('matches')
      .select('*, match_players(user_id, side, profiles(full_name))')
      .eq('club_id', clubId)
      .eq('status', 'disputed')
    setDisputedMatches(disputed || [])

    setLoading(false)
  }

  async function updateMemberStatus(membershipId, status) {
    await supabase.from('memberships').update({ status }).eq('id', membershipId)
    showToast(status === 'approved' ? '✔ Member approved' : '✘ Member rejected')
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

  async function addGuest() {
    if (!guestName.trim()) return
    setAddingGuest(true)
    const guestId = crypto.randomUUID()
    const { error } = await supabase.rpc('create_guest_profile', {
      guest_id: guestId,
      guest_name: guestName.trim(),
      p_club_id: clubId
    })
    if (!error) {
      showToast(`Guest "${guestName.trim()}" added!`)
      setGuestName('')
      setShowGuestForm(false)
      fetchData()
    } else {
      showToast('Error adding guest')
    }
    setAddingGuest(false)
  }

  async function resolveDispute(matchId, resolution) {
    // resolution: 'confirmed' = keep as is, 'void' = delete match
    if (resolution === 'void') {
      if (!confirm('This will delete the match entirely. Are you sure?')) return
      await supabase.from('match_players').delete().eq('match_id', matchId)
      await supabase.from('matches').delete().eq('id', matchId)
      showToast('Match voided')
    } else {
      await supabase.from('matches').update({ status: 'confirmed' }).eq('id', matchId)
      showToast('Match confirmed')
    }
    fetchData()
  }

  function getTeamNames(match, side) {
    return match.match_players?.filter(p => p.side === side).map(p => p.profiles?.full_name || '?').join(' + ')
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
          {linkCopied ? '✔' : '🔗'}
        </button>
      </div>

      {/* Matches shortcut */}
      <div style={{ padding:'10px 20px 0' }}>
        <button className="btn btn-secondary btn-sm"
          onClick={() => navigate(`/club/${clubId}/matches`)}
          style={{ width:'100%', marginBottom:0 }}>
          🏸 Matches & Leaderboard
        </button>
      </div>

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
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div className="section-label" style={{ margin:0 }}>Members ({approved.filter(m => !m.is_guest).length})</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowGuestForm(!showGuestForm)}>
              + Add Guest
            </button>
          </div>

          {/* Guest form */}
          {showGuestForm && (
            <div className="card" style={{ marginBottom:12, background:'var(--bg3)' }}>
              <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>
                Guest players can be selected in matches but won't appear on the leaderboard.
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input className="input" placeholder="Guest name e.g. John"
                  value={guestName} onChange={e => setGuestName(e.target.value)}
                  style={{ flex:1 }}
                  onKeyDown={e => e.key === 'Enter' && addGuest()}
                />
                <button className="btn btn-primary btn-sm" onClick={addGuest}
                  disabled={!guestName.trim() || addingGuest}>
                  {addingGuest ? '…' : 'Add'}
                </button>
              </div>
            </div>
          )}

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
                  {m.is_guest && <span className="badge" style={{ background:'rgba(255,200,50,0.12)', color:'#ffc832' }}>guest</span>}
                </div>
              </div>
              <div className="member-actions">
                {m.role !== 'moderator' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => promoteMod(m.id)} title="Promote to mod">⭑</button>
                )}
                {m.user_id !== user.id && (
                  <button className="btn btn-danger btn-sm" onClick={() => removeMember(m.id)} title="Remove">✕</button>
                )}
              </div>
            </div>
          ))}
        </>}

        {tab === 'disputes' && <>
          <div style={{ marginBottom:16 }}>
            <h2 style={{ fontSize:22, marginBottom:4 }}>Disputed Matches</h2>
            <p style={{ fontSize:13, color:'var(--text2)' }}>Review and resolve matches that players have disputed.</p>
          </div>
          {disputedMatches.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">✅</div>
              <p>No disputed matches. All clear!</p>
            </div>
          ) : disputedMatches.map(match => (
            <div key={match.id} className="card" style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:'#ff5c5c', fontWeight:600, marginBottom:8, textTransform:'uppercase' }}>⚠ Disputed</div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{getTeamNames(match, 'team1')}</div>
                </div>
                <div style={{ textAlign:'center', minWidth:60 }}>
                  <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700 }}>
                    {match.team1_score} – {match.team2_score}
                  </div>
                </div>
                <div style={{ flex:1, textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{getTeamNames(match, 'team2')}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                  onClick={() => resolveDispute(match.id, 'confirmed')}>
                  ✔ Confirm Result
                </button>
                <button className="btn btn-danger btn-sm" style={{ flex:1 }}
                  onClick={() => resolveDispute(match.id, 'void')}>
                  ✕ Void Match
                </button>
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
              {linkCopied ? '✔ Copied!' : '🔗 Copy invite link'}
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
          { id:'disputes', icon:'⚠', label:'Disputes', badge: disputedMatches.length },
          { id:'settings', icon:'⚙', label:'Settings' },
        ].map(t => (
          <button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}
            style={{ background:'none',border:'none',cursor:'pointer', position:'relative' }}>
            <span className="tab-icon">{t.icon}</span>
            {t.badge > 0 && (
              <span style={{
                position:'absolute', top:0, right:'50%', transform:'translateX(12px)',
                background:'#ff5c5c', color:'#fff', borderRadius:99,
                fontSize:10, fontWeight:700, padding:'1px 5px', minWidth:16, textAlign:'center'
              }}>{t.badge}</span>
            )}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
