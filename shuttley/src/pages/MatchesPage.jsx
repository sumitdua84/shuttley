import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function MatchesPage() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [tab, setTab] = useState('history')
  const [matches, setMatches] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [club, setClub] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  useEffect(() => {
    if (location.state?.success) {
      showToast('⏳ Match submitted — awaiting opponent confirmation!')
      window.history.replaceState({}, '')
    }
    fetchAll()
  }, [clubId])

  async function fetchAll() {
    const { data: clubData } = await supabase.from('clubs').select('*').eq('id', clubId).single()
    setClub(clubData)

    const { data: mems } = await supabase
      .from('memberships')
      .select('user_id, is_guest, profiles(id, full_name, avatar_url, is_guest)')
      .eq('club_id', clubId).eq('status', 'approved')
    setMembers((mems || []).map(m => ({ ...m.profiles, is_guest: m.is_guest })).filter(Boolean))

    const { data: matchData } = await supabase
      .from('matches')
      .select('*, match_players(user_id, side, profiles(full_name, avatar_url))')
      .eq('club_id', clubId)
      .order('played_at', { ascending: false })
    setMatches(matchData || [])
    setLoading(false)
  }

  function getTeam(match, side) {
    return match.match_players?.filter(p => p.side === side) || []
  }

  function getTeamNames(match, side) {
    return getTeam(match, side).map(p => p.profiles?.full_name || '?').join(' + ')
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
  }

  function getStatusBadge(status) {
    if (status === 'pending') return { label:'⏳ Pending', color:'#ffc832', bg:'rgba(255,200,50,0.1)' }
    if (status === 'disputed') return { label:'⚠ Disputed', color:'#ff5c5c', bg:'rgba(255,92,92,0.1)' }
    return null
  }

  // Only confirmed matches count for leaderboard/stats
  const confirmedMatches = matches.filter(m => m.status === 'confirmed')

  function calcStats() {
    const stats = {}
    members.filter(m => !m.is_guest).forEach(m => {
      stats[m.id] = { id: m.id, name: m.full_name, avatar: m.avatar_url, wins: 0, losses: 0, points_for: 0, points_against: 0 }
    })

    confirmedMatches.forEach(match => {
      const team1Players = getTeam(match, 'team1').map(p => p.user_id)
      const team2Players = getTeam(match, 'team2').map(p => p.user_id)
      const team1Won = match.winner_side === 'team1'

      team1Players.forEach(id => {
        if (!stats[id]) return
        if (team1Won) stats[id].wins++
        else stats[id].losses++
        stats[id].points_for += match.team1_score
        stats[id].points_against += match.team2_score
      })
      team2Players.forEach(id => {
        if (!stats[id]) return
        if (!team1Won) stats[id].wins++
        else stats[id].losses++
        stats[id].points_for += match.team2_score
        stats[id].points_against += match.team1_score
      })
    })

    return Object.values(stats)
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        const aRate = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0
        const bRate = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0
        return bRate - aRate
      })
  }

  function getPlayerStats(playerId) {
    const playerMatches = confirmedMatches.filter(m =>
      m.match_players?.some(p => p.user_id === playerId)
    )
    let wins = 0, losses = 0, pointsFor = 0, pointsAgainst = 0
    const opponents = {}
    const partners = {}

    playerMatches.forEach(match => {
      const myTeam = match.match_players?.find(p => p.user_id === playerId)?.side
      const won = match.winner_side === myTeam
      const myScore = myTeam === 'team1' ? match.team1_score : match.team2_score
      const oppScore = myTeam === 'team1' ? match.team2_score : match.team1_score

      if (won) wins++; else losses++
      pointsFor += myScore
      pointsAgainst += oppScore

      match.match_players?.filter(p => p.side !== myTeam).forEach(p => {
        if (!opponents[p.user_id]) opponents[p.user_id] = { name: p.profiles?.full_name, wins: 0, losses: 0 }
        if (won) opponents[p.user_id].wins++
        else opponents[p.user_id].losses++
      })

      if (match.type === 'doubles') {
        match.match_players?.filter(p => p.side === myTeam && p.user_id !== playerId).forEach(p => {
          if (!partners[p.user_id]) partners[p.user_id] = { name: p.profiles?.full_name, wins: 0, losses: 0 }
          if (won) partners[p.user_id].wins++
          else partners[p.user_id].losses++
        })
      }
    })

    const bestPartner = Object.values(partners).sort((a,b) => b.wins - a.wins)[0]

    return { wins, losses, pointsFor, pointsAgainst, total: playerMatches.length, bestPartner, opponents: Object.values(opponents) }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const leaderboard = calcStats()

  return (
    <div className="page">
      <div className="topnav">
        <button onClick={() => navigate(-1)}
          style={{ background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:22,padding:0 }}>←</button>
        <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:18 }}>{club?.name}</span>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/club/${clubId}/record`)}>
          + Match
        </button>
      </div>

      <div className="content" style={{ paddingTop:12 }}>

        {/* Tabs */}
        <div style={{ display:'flex', gap:0, marginBottom:20, background:'var(--bg2)', borderRadius:'var(--radius)', padding:4 }}>
          {[['history','📋 History'],['leaderboard','🏅 Leaders'],['stats','📈 Stats']].map(([id,label]) => (
            <button key={id} onClick={() => { setTab(id); setSelectedPlayer(null) }}
              style={{
                flex:1, padding:'8px 4px', borderRadius:'var(--radius-sm)',
                border:'none', cursor:'pointer', fontSize:13, fontWeight:500,
                background: tab===id ? 'var(--accent)' : 'transparent',
                color: tab===id ? 'var(--bg)' : 'var(--text2)',
                transition:'all 0.15s'
              }}>{label}</button>
          ))}
        </div>

        {loading && <div style={{ color:'var(--text3)', fontSize:14, padding:'20px 0' }}>Loading…</div>}

        {/* Match History */}
        {!loading && tab === 'history' && <>
          {matches.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>No matches yet.<br />Tap "+ Match" to record the first one!</p>
            </div>
          ) : matches.map(match => {
            const winnerSide = match.winner_side
            const loserSide = winnerSide === 'team1' ? 'team2' : 'team1'
            const winnerScore = winnerSide === 'team1' ? match.team1_score : match.team2_score
            const loserScore = loserSide === 'team1' ? match.team1_score : match.team2_score
            const badge = getStatusBadge(match.status)
            return (
              <div key={match.id} className="card" style={{ marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', fontWeight:600 }}>
                    {match.type}
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {badge && (
                      <span style={{ fontSize:11, fontWeight:600, color:badge.color, background:badge.bg, padding:'2px 8px', borderRadius:99 }}>
                        {badge.label}
                      </span>
                    )}
                    <span style={{ fontSize:11, color:'var(--text3)' }}>{formatDate(match.played_at)}</span>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1 }}>
                    {getTeam(match, winnerSide).map(p => (
                      <div key={p.user_id} style={{ fontSize:14, color:'var(--text)' }}>
                        {p.profiles?.full_name || '?'}
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign:'center', minWidth:70 }}>
                    <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700 }}>
                      <span style={{ color:'var(--accent)' }}>{winnerScore}</span>
                      <span style={{ color:'var(--text3)', margin:'0 4px' }}>–</span>
                      <span style={{ color:'#ff5c5c' }}>{loserScore}</span>
                    </div>
                  </div>
                  <div style={{ flex:1, textAlign:'right' }}>
                    {getTeam(match, loserSide).map(p => (
                      <div key={p.user_id} style={{ fontSize:14, color:'var(--text)' }}>
                        {p.profiles?.full_name || '?'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </>}

        {/* Leaderboard */}
        {!loading && tab === 'leaderboard' && <>
          <p style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>Based on confirmed matches only</p>
          {leaderboard.filter(p => p.wins + p.losses > 0).length === 0 ? (
            <div className="empty"><p>No confirmed matches yet</p></div>
          ) : leaderboard.map((p, i) => {
            const total = p.wins + p.losses
            if (total === 0) return null
            const rate = Math.round(p.wins / total * 100)
            const medals = ['🥇','🥈','🥉']
            return (
              <div key={p.id} className="card" style={{ marginBottom:10, cursor:'pointer' }}
                onClick={() => { setSelectedPlayer(p.id); setTab('stats') }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ fontSize:20, width:28, textAlign:'center' }}>
                    {i < 3 ? medals[i] : <span style={{ fontSize:14, color:'var(--text3)', fontWeight:600 }}>#{i+1}</span>}
                  </div>
                  <div className="member-avatar">
                    {p.avatar
                      ? <img src={p.avatar} alt="" />
                      : <div className="member-avatar-init">{(p.name||'?')[0]}</div>
                    }
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:15 }}>{p.name}</div>
                    <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>
                      {p.wins}W · {p.losses}L · {rate}% win rate
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:20, fontWeight:700, color:'var(--accent)' }}>{p.wins}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>wins</div>
                  </div>
                </div>
                <div style={{ marginTop:10, height:4, borderRadius:99, background:'var(--bg3)', overflow:'hidden' }}>
                  <div style={{ width:`${rate}%`, height:'100%', background:'var(--accent)', borderRadius:99, transition:'width 0.5s' }}/>
                </div>
              </div>
            )
          })}
        </>}

        {/* Stats */}
        {!loading && tab === 'stats' && <>
          <div style={{ marginBottom:16 }}>
            <div className="section-label">Select player</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {members.map(m => (
                <button key={m.id} onClick={() => setSelectedPlayer(m.id)}
                  style={{
                    padding:'6px 14px', borderRadius:99, fontSize:13, fontWeight:500,
                    border:`1.5px solid ${selectedPlayer===m.id ? 'var(--accent)' : 'var(--border2)'}`,
                    background: selectedPlayer===m.id ? 'var(--accent-dim)' : 'var(--bg2)',
                    color: selectedPlayer===m.id ? 'var(--accent)' : 'var(--text2)',
                    cursor:'pointer'
                  }}>{m.full_name?.split(' ')[0]}</button>
              ))}
            </div>
          </div>

          {!selectedPlayer && (
            <div className="empty"><p>Select a player to see their stats</p></div>
          )}

          {selectedPlayer && (() => {
            const s = getPlayerStats(selectedPlayer)
            const rate = s.total > 0 ? Math.round(s.wins / s.total * 100) : 0
            const name = members.find(m => m.id === selectedPlayer)?.full_name

            return <>
              <div style={{ marginBottom:16 }}>
                <h2 style={{ fontSize:22, marginBottom:2 }}>{name}</h2>
                <p style={{ fontSize:13, color:'var(--text2)' }}>{s.total} confirmed matches</p>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                {[
                  ['🏅', s.wins, 'Wins'],
                  ['❌', s.losses, 'Losses'],
                  ['📊', `${rate}%`, 'Win Rate'],
                  ['🎯', s.pointsFor, 'Points Scored'],
                ].map(([icon, val, label]) => (
                  <div key={label} className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
                    <div style={{ fontSize:24, fontWeight:700, color:'var(--accent)' }}>{val}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'var(--text2)' }}>Win rate</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--accent)' }}>{rate}%</span>
                </div>
                <div style={{ height:6, borderRadius:99, background:'var(--bg3)', overflow:'hidden' }}>
                  <div style={{ width:`${rate}%`, height:'100%', background:'var(--accent)', borderRadius:99 }}/>
                </div>
              </div>

              {s.bestPartner && (
                <div className="card" style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>BEST DOUBLES PARTNER</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:15, fontWeight:500 }}>🤝 {s.bestPartner.name}</div>
                    <div style={{ fontSize:13, color:'var(--text2)' }}>{s.bestPartner.wins}W together</div>
                  </div>
                </div>
              )}

              {s.opponents.length > 0 && <>
                <div className="section-label" style={{ marginTop:16 }}>Head-to-Head</div>
                {s.opponents.sort((a,b) => (b.wins+b.losses)-(a.wins+a.losses)).map(opp => {
                  const total = opp.wins + opp.losses
                  const oppRate = total > 0 ? Math.round(opp.wins/total*100) : 0
                  return (
                    <div key={opp.name} className="card" style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:14, fontWeight:500 }}>vs {opp.name}</span>
                        <span style={{ fontSize:13, color: opp.wins >= opp.losses ? 'var(--accent)' : '#ff5c5c' }}>
                          {opp.wins}–{opp.losses}
                        </span>
                      </div>
                      <div style={{ height:4, borderRadius:99, background:'var(--bg3)', overflow:'hidden' }}>
                        <div style={{ width:`${oppRate}%`, height:'100%', background: opp.wins >= opp.losses ? 'var(--accent)' : '#ff5c5c', borderRadius:99 }}/>
                      </div>
                    </div>
                  )
                })}
              </>}
            </>
          })()}
        </>}

      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
