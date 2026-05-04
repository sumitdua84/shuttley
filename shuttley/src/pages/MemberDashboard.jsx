import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

export default function MemberDashboard() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [membership, setMembership] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [clubId, user])

  async function fetchData() {
    const { data: clubData } = await supabase.from('clubs').select('*').eq('id', clubId).single()
    setClub(clubData)

    const { data: mem } = await supabase.from('memberships').select('*')
      .eq('club_id', clubId).eq('user_id', user.id).single()
    setMembership(mem)

    if (mem?.status === 'approved') {
      const { data: assigns } = await supabase
        .from('session_assignments')
        .select('*, sessions(*)')
        .eq('membership_id', mem.id)
      setAssignments(assigns || [])
    }
    setLoading(false)
  }

  if (loading) return <div className="splash"><div className="splash-logo">S</div></div>

  const myDays = assignments.map(a => a.sessions?.day_of_week).filter(Boolean)

  return (
    <div className="page">
      <div className="topnav">
        <button onClick={() => navigate('/')} style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:22,padding:0 }}>←</button>
        <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:18 }}>{club?.name}</span>
        <span className="badge badge-mod" style={{ opacity: 0 }}>.</span>
      </div>

      <div className="content">
        {membership?.status === 'pending' && (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ fontSize:48, marginBottom:20 }}>⏳</div>
            <h2 style={{ fontSize:24, marginBottom:10 }}>Pending approval</h2>
            <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.6 }}>
              Your request to join <strong>{club?.name}</strong> is waiting for the moderator to approve you.
              You'll be able to access the club once approved.
            </p>
          </div>
        )}

        {membership?.status === 'approved' && <>
          <div style={{ marginBottom:24 }}>
            <h2 style={{ fontSize:26, marginBottom:4 }}>My sessions</h2>
            <p style={{ color:'var(--text2)', fontSize:13 }}>Days you've been assigned to</p>
          </div>

          {myDays.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📅</div>
              <p>No sessions assigned yet.<br />Your moderator will assign you to days soon.</p>
            </div>
          ) : (
            <>
              <div className="day-grid" style={{ marginBottom:24 }}>
                {DAYS.filter(d => myDays.includes(d)).map(day => (
                  <div key={day} className="day-pill active" style={{ cursor:'default' }}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </div>
                ))}
              </div>

              <div className="section-label">Session details</div>
              {assignments.map(a => a.sessions && (
                <div key={a.id} className="card" style={{ marginBottom:10 }}>
                  <div style={{ fontWeight:500, fontSize:15, marginBottom:4, textTransform:'capitalize' }}>
                    {a.sessions.day_of_week}
                  </div>
                  {a.sessions.start_time && (
                    <div style={{ fontSize:13, color:'var(--text2)' }}>🕐 {a.sessions.start_time}</div>
                  )}
                  {a.sessions.location && (
                    <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>📍 {a.sessions.location}</div>
                  )}
                  {a.sessions.notes && (
                    <div style={{ fontSize:12, color:'var(--text3)', marginTop:6 }}>{a.sessions.notes}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </>}

        {membership?.status === 'rejected' && (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ fontSize:48, marginBottom:20 }}>❌</div>
            <h2 style={{ fontSize:24, marginBottom:10 }}>Request declined</h2>
            <p style={{ color:'var(--text2)', fontSize:14 }}>Your request to join was not approved.</p>
            <button className="btn btn-ghost" style={{ marginTop:24 }} onClick={() => navigate('/')}>
              Go back home
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
