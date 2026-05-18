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

  function properCase(str) {
    if (!str) return ''
    return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  function shortName(fullName) {
    if (!fullName) return '?'
    const parts = properCase(fullName).split(' ')
    if (parts.length === 1) return parts[0]
    return `${parts[0]} ${parts[parts.length - 1][0]}`
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
      stats[m.id] = { id: m.id, name: m.full_name, avatar: m.avatar_url, wins: 0, losses: 0, points_for: 0, points_against: 0, streak: 0, streakType: null }
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

    // Current streak per player (most-recent-first)
    const sortedByDate = [...confirmedMatches].sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
    Object.keys(stats).forEach(id => {
      const pm = sortedByDate.filter(m => m.match_players?.some(p => p.user_id === id))
      if (pm.length === 0) return
      const myTeam0 = pm[0].match_players?.find(p => p.user_id === id)?.side
      const first = pm[0].winner_side === myTeam0 ? 'W' : 'L'
      stats[id].streakType = first
      let s = 0
      for (const m of pm) {
        const myTeam = m.match_players?.find(p => p.user_id === id)?.side
        if ((m.winner_side === myTeam ? 'W' : 'L') === first) s++
        else break
      }
      stats[id].streak = s
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
    const sorted = [...playerMatches].sort((a, b) => new Date(b.played_at) - new Date(a.played_at))

    let wins = 0, losses = 0, pointsFor = 0, pointsAgainst = 0
    const opponents = {}
    const partners = {}
    let streak = 0, streakType = null
    const form = []

    sorted.forEach((match, idx) => {
      const myTeam = match.match_players?.find(p => p.user_id === playerId)?.side
      const won = match.winner_side === myTeam
      const myScore = myTeam === 'team1' ? match.team1_score : match.team2_score
      const oppScore = myTeam === 'team1' ? match.team2_score : match.team1_score

      if (won) wins++; else losses++
      pointsFor += myScore
      pointsAgainst += oppScore

      if (idx < 5) form.push(won ? 'W' : 'L')
      if (streakType === null) { streakType = won ? 'W' : 'L'; streak = 1 }
      else if ((won && streakType === 'W') || (!won && streakType === 'L')) streak++

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

    const oppList = Object.values(opponents)
    const partnerList = Object.values(partners).map(p => ({
      ...p, total: p.wins + p.losses,
      rate: p.wins + p.losses > 0 ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0
    }))
    const bestPartner = partnerList.sort((a, b) => b.wins - a.wins)[0]
    const nemesis = oppList.filter(o => o.losses > 0).sort((a, b) => b.losses - a.losses)[0]
    const victim = oppList.filter(o => o.wins > 0).sort((a, b) => b.wins - a.wins)[0]

    // Biggest win by margin
    let biggestWin = null
    sorted.forEach(m => {
      const myTeam = m.match_players?.find(p => p.user_id === playerId)?.side
      if (m.winner_side !== myTeam) return
      const myScore = myTeam === 'team1' ? m.team1_score : m.team2_score
      const oppScore = myTeam === 'team1' ? m.team2_score : m.team1_score
      const margin = myScore - oppScore
      if (!biggestWin || margin > biggestWin.margin) biggestWin = { myScore, oppScore, margin }
    })

    // Last 30 days record
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    const recent = sorted.filter(m => m.played_at && new Date(m.played_at) >= cutoff)
    const recentWins = recent.filter(m => {
      const myTeam = m.match_players?.find(p => p.user_id === playerId)?.side
      return m.winner_side === myTeam
    }).length
    const last30 = {
      total: recent.length, wins: recentWins, losses: recent.length - recentWins,
      rate: recent.length > 0 ? Math.round(recentWins / recent.length * 100) : 0
    }

    return {
      wins, losses, pointsFor, pointsAgainst, total: playerMatches.length,
      bestPartner, opponents: oppList, nemesis, victim, form, streak, streakType,
      avgScore: playerMatches.length > 0 ? (pointsFor / playerMatches.length).toFixed(1) : '0.0',
      biggestWin, last30
    }
  }

  function calcPartnerships() {
    const pairs = {}
    confirmedMatches.filter(m => m.type === 'doubles').forEach(match => {
      ['team1', 'team2'].forEach(side => {
        const sideTeam = getTeam(match, side)
        if (sideTeam.length !== 2) return
        const key = sideTeam.map(p => p.user_id).sort().join('|')
        if (!pairs[key]) pairs[key] = { names: sideTeam.map(p => p.profiles?.full_name), wins: 0, losses: 0 }
        if (match.winner_side === side) pairs[key].wins++
        else pairs[key].losses++
      })
    })
    return Object.values(pairs)
      .filter(p => p.wins + p.losses >= 2)
      .map(p => ({ ...p, total: p.wins + p.losses, rate: Math.round(p.wins / (p.wins + p.losses) * 100) }))
      .sort((a, b) => b.rate - a.rate || b.wins - a.wins)
  }

  function calcClubRecords(lb) {
    if (confirmedMatches.length === 0) return null
    let highScore = 0, biggestMargin = 0, biggestMarginScore = ''
    confirmedMatches.forEach(m => {
      const winScore = m.winner_side === 'team1' ? m.team1_score : m.team2_score
      const loseScore = m.winner_side === 'team1' ? m.team2_score : m.team1_score
      if (winScore > highScore) highScore = winScore
      const margin = winScore - loseScore
      if (margin > biggestMargin) { biggestMargin = margin; biggestMarginScore = `${winScore} – ${loseScore}` }
    })
    const dayCount = {}
    confirmedMatches.forEach(m => {
      if (!m.played_at) return
      const d = new Date(m.played_at).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
      dayCount[d] = (dayCount[d] || 0) + 1
    })
    const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]
    const topPlayer = lb.filter(p => p.wins > 0)[0]
    const topStreak = lb.filter(p => p.streakType === 'W' && p.streak >= 3).sort((a, b) => b.streak - a.streak)[0]
    return { highScore, biggestMargin, biggestMarginScore, busiestDay, topPlayer, topStreak }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const leaderboard = calcStats()
  const partnerships = calcPartnerships()
  const clubRecords = calcClubRecords(leaderboard)

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
            <button key={id} onClick={() => { setTab(id); if (id === 'stats') setSelectedPlayer(p => p ?? user.id); else setSelectedPlayer(null) }}
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

          {/* Daily snapshot */}
          {(() => {
            const today = new Date().toDateString()
            const todayMatches = confirmedMatches.filter(m => m.played_at && new Date(m.played_at).toDateString() === today)
            if (todayMatches.length === 0) return null
            const todayWins = {}
            todayMatches.forEach(match => {
              getTeam(match, match.winner_side).forEach(p => {
                if (!todayWins[p.user_id]) todayWins[p.user_id] = { name: p.profiles?.full_name, wins: 0 }
                todayWins[p.user_id].wins++
              })
            })
            const mvp = Object.values(todayWins).sort((a, b) => b.wins - a.wins)[0]
            return (
              <div style={{
                background: 'linear-gradient(135deg, rgba(100,210,120,0.12) 0%, rgba(50,120,220,0.12) 100%)',
                border: '1px solid rgba(100,210,120,0.2)',
                borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 16,
                position: 'relative', overflow: 'hidden'
              }}>
                <div style={{ position:'absolute', right:-8, top:-8, fontSize:60, opacity:0.07, pointerEvents:'none' }}>🏸</div>
                <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', marginBottom:10 }}>
                  Today · {new Date().toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'short' })}
                </div>
                <div style={{ display:'flex', gap:28, alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:30, fontWeight:800, color:'var(--accent)', lineHeight:1 }}>{todayMatches.length}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>match{todayMatches.length > 1 ? 'es' : ''} played</div>
                  </div>
                  {mvp && (
                    <div>
                      <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>🏆 {shortName(mvp.name)}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{mvp.wins}W today · MVP</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

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
                        {shortName(p.profiles?.full_name)}
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
                        {shortName(p.profiles?.full_name)}
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
                    <div style={{ fontWeight:500, fontSize:15 }}>
                      {properCase(p.name)}
                      {p.streakType === 'W' && p.streak >= 3 && <span style={{ marginLeft:6, fontSize:14 }}>🔥</span>}
                    </div>
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

          {/* Best Pairs */}
          {partnerships.length > 0 && <>
            <hr className="divider" />
            <div className="section-label">Best Pairs</div>
            {partnerships.map((pair, i) => {
              const medals = ['🥇','🥈','🥉']
              return (
                <div key={i} className="card" style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ fontSize:18, width:24 }}>{i < 3 ? medals[i] : `#${i+1}`}</div>
                      <div>
                        <div style={{ fontWeight:500, fontSize:14 }}>{pair.names.map(n => shortName(n)).join(' · ')}</div>
                        <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{pair.wins}W · {pair.losses}L · {pair.total} matches</div>
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:'var(--accent)' }}>{pair.rate}%</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>win rate</div>
                    </div>
                  </div>
                  <div style={{ marginTop:8, height:3, borderRadius:99, background:'var(--bg3)', overflow:'hidden' }}>
                    <div style={{ width:`${pair.rate}%`, height:'100%', background:'var(--accent)', borderRadius:99 }}/>
                  </div>
                </div>
              )
            })}
          </>}

          {/* Club Records */}
          {clubRecords && <>
            <hr className="divider" />
            <div className="section-label">Club Records</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {clubRecords.topPlayer && (
                <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>🏆</div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--accent)' }}>{clubRecords.topPlayer.wins}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Most Wins</div>
                  <div style={{ fontSize:12, color:'var(--text2)', marginTop:4 }}>{shortName(clubRecords.topPlayer.name)}</div>
                </div>
              )}
              {clubRecords.topStreak && (
                <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>🔥</div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--accent)' }}>{clubRecords.topStreak.streak}W</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Hot Streak</div>
                  <div style={{ fontSize:12, color:'var(--text2)', marginTop:4 }}>{shortName(clubRecords.topStreak.name)}</div>
                </div>
              )}
              {clubRecords.highScore > 0 && (
                <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>🎯</div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--accent)' }}>{clubRecords.highScore}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>High Score</div>
                </div>
              )}
              {clubRecords.biggestMargin > 0 && (
                <div className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>⚡</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--accent)', fontFamily:'monospace' }}>{clubRecords.biggestMarginScore}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Biggest Win</div>
                </div>
              )}
              {clubRecords.busiestDay && (
                <div className="card" style={{ textAlign:'center', padding:'14px 10px', gridColumn:'1/-1' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>📅</div>
                  <div style={{ fontSize:20, fontWeight:700, color:'var(--accent)' }}>{clubRecords.busiestDay[1]}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Matches in a day</div>
                  <div style={{ fontSize:12, color:'var(--text2)', marginTop:4 }}>{clubRecords.busiestDay[0]}</div>
                </div>
              )}
            </div>
          </>}
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
                  }}>{shortName(m.full_name)}</button>
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
                <h2 style={{ fontSize:22, marginBottom:2 }}>{properCase(name)}</h2>
                <p style={{ fontSize:13, color:'var(--text2)' }}>{s.total} confirmed matches</p>
              </div>

              {/* Overview grid */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                {[
                  ['🏅', s.wins, 'Wins', 'var(--accent)'],
                  ['❌', s.losses, 'Losses', '#ff5c5c'],
                  ['📊', `${rate}%`, 'Win Rate', rate >= 50 ? 'var(--accent)' : '#ff5c5c'],
                  ['🔥', s.streak > 0 ? `${s.streak}${s.streakType}` : '–', 'Streak', s.streakType === 'W' ? 'var(--accent)' : '#ff5c5c'],
                ].map(([icon, val, label, color]) => (
                  <div key={label} className="card" style={{ textAlign:'center', padding:'14px 10px' }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
                    <div style={{ fontSize:24, fontWeight:700, color }}>{val}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Form: last 5 */}
              {s.form.length > 0 && (
                <div className="card" style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', marginBottom:10 }}>
                    Last {s.form.length} Results
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {s.form.map((r, i) => (
                      <div key={i} style={{
                        width:34, height:34, borderRadius:99,
                        background: r === 'W' ? 'rgba(100,220,120,0.12)' : 'rgba(255,92,92,0.12)',
                        border: `1.5px solid ${r === 'W' ? 'var(--accent)' : '#ff5c5c'}`,
                        color: r === 'W' ? 'var(--accent)' : '#ff5c5c',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, fontWeight:700
                      }}>{r}</div>
                    ))}
                    <div style={{ fontSize:11, color:'var(--text3)', marginLeft:4 }}>← recent</div>
                  </div>
                </div>
              )}

              {/* Avg score */}
              <div className="card" style={{ marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:14, color:'var(--text2)' }}>🎯 Avg points per match</span>
                <span style={{ fontSize:18, fontWeight:700, color:'var(--accent)' }}>{s.avgScore}</span>
              </div>

              {/* Last 30 days */}
              {s.last30.total > 0 && (
                <div className="card" style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase' }}>Last 30 Days</span>
                    <span style={{ fontSize:13, fontWeight:600, color: s.last30.rate >= 50 ? 'var(--accent)' : '#ff5c5c' }}>{s.last30.rate}%</span>
                  </div>
                  <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>
                    {s.last30.wins}W · {s.last30.losses}L · {s.last30.total} matches
                  </div>
                  <div style={{ height:4, borderRadius:99, background:'var(--bg3)', overflow:'hidden' }}>
                    <div style={{ width:`${s.last30.rate}%`, height:'100%', background: s.last30.rate >= 50 ? 'var(--accent)' : '#ff5c5c', borderRadius:99 }}/>
                  </div>
                </div>
              )}

              {/* Biggest win */}
              {s.biggestWin && (
                <div className="card" style={{ marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:13, color:'var(--text2)' }}>⚡ Biggest win</span>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:'var(--accent)' }}>
                      {s.biggestWin.myScore} – {s.biggestWin.oppScore}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>+{s.biggestWin.margin} pts</div>
                  </div>
                </div>
              )}

              {/* Best partner */}
              {s.bestPartner && (
                <div className="card" style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', marginBottom:8 }}>
                    Best Doubles Partner
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:15, fontWeight:500 }}>🤝 {shortName(s.bestPartner.name)}</div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--accent)' }}>{s.bestPartner.rate}% wins</div>
                      <div style={{ fontSize:12, color:'var(--text3)' }}>{s.bestPartner.wins}W · {s.bestPartner.losses}L together</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Nemesis */}
              {s.nemesis && (
                <div className="card" style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', marginBottom:8 }}>
                    😈 Nemesis
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:15, fontWeight:500 }}>{shortName(s.nemesis.name)}</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#ff5c5c' }}>{s.nemesis.wins}W – {s.nemesis.losses}L</div>
                  </div>
                </div>
              )}

              {/* Favourite opponent */}
              {s.victim && s.victim.name !== s.nemesis?.name && (
                <div className="card" style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', marginBottom:8 }}>
                    🎯 Favourite Opponent
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:15, fontWeight:500 }}>{shortName(s.victim.name)}</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--accent)' }}>{s.victim.wins}W – {s.victim.losses}L</div>
                  </div>
                </div>
              )}

              {/* Head-to-Head */}
              {s.opponents.length > 0 && <>
                <div className="section-label" style={{ marginTop:4 }}>Head-to-Head</div>
                {s.opponents.sort((a,b) => (b.wins+b.losses)-(a.wins+a.losses)).map(opp => {
                  const total = opp.wins + opp.losses
                  const oppRate = total > 0 ? Math.round(opp.wins/total*100) : 0
                  return (
                    <div key={opp.name} className="card" style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:14, fontWeight:500 }}>vs {shortName(opp.name)}</span>
                        <span style={{ fontSize:13, fontWeight:600, color: opp.wins >= opp.losses ? 'var(--accent)' : '#ff5c5c' }}>
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
