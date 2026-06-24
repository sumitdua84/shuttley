import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import GroupNav from '../components/GroupNav'
import Toast from '../components/Toast'
import { useConfirm } from '../hooks/useConfirm'

export default function MatchesPage() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'history')
  const [matches, setMatches] = useState([])
  const [members, setMembers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [confirmDialog, confirmModal] = useConfirm()
  const [club, setClub] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [openDates, setOpenDates] = useState(null) // null = auto-open first group
  const [showAllPairs, setShowAllPairs] = useState(false)
  const [showAllLeaders, setShowAllLeaders] = useState(false)
  const [showAllH2H, setShowAllH2H] = useState(false)
  const [showAllPartners, setShowAllPartners] = useState(false)
  const [openSessions, setOpenSessions] = useState(null) // null = first open
  const [isModerator, setIsModerator] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editingSessionName, setEditingSessionName] = useState('')

  useEffect(() => {
    if (location.state?.success) {
      showToast('⏳ Match submitted — awaiting opponent confirmation!')
    }
    // state tab overrides URL tab (navigating from dashboard)
    const t = location.state?.tab || searchParams.get('tab') || 'history'
    setTab(t)
    if (t === 'stats') setSelectedPlayer(user.id)
    // write tab into URL so refresh preserves it
    setSearchParams({ tab: t }, { replace: true })
    window.history.replaceState({}, '')
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

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('started_at', { ascending: false })
    setSessions(sessionData || [])

    const { data: myMem } = await supabase
      .from('memberships').select('role').eq('club_id', clubId).eq('user_id', user.id).single()
    setIsModerator(myMem?.role === 'moderator')

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

    let doublesWins = 0, doublesLosses = 0, singlesWins = 0, singlesLosses = 0
    let winMarginTotal = 0, winMarginCount = 0
    let lossMarginTotal = 0, lossMarginCount = 0
    let closeGames = 0   // margin ≤ 3
    let dominantWins = 0 // margin ≥ 10
    let biggestWin = null, biggestLoss = null
    const monthlyStats = {}

    sorted.forEach((match, idx) => {
      const myTeam = match.match_players?.find(p => p.user_id === playerId)?.side
      const won = match.winner_side === myTeam
      const myScore = myTeam === 'team1' ? match.team1_score : match.team2_score
      const oppScore = myTeam === 'team1' ? match.team2_score : match.team1_score
      const margin = Math.abs(myScore - oppScore)

      if (won) wins++; else losses++
      pointsFor += myScore
      pointsAgainst += oppScore

      if (idx < 10) form.push(won ? 'W' : 'L')
      if (streakType === null) { streakType = won ? 'W' : 'L'; streak = 1 }
      else if ((won && streakType === 'W') || (!won && streakType === 'L')) streak++

      if (match.type === 'doubles') { if (won) doublesWins++; else doublesLosses++ }
      else { if (won) singlesWins++; else singlesLosses++ }

      // Margin stats
      if (won) {
        winMarginTotal += margin; winMarginCount++
        if (margin >= 10) dominantWins++
        if (!biggestWin || margin > biggestWin.margin) biggestWin = { myScore, oppScore, margin }
      } else {
        lossMarginTotal += margin; lossMarginCount++
        if (!biggestLoss || margin > biggestLoss.margin) biggestLoss = { myScore, oppScore, margin }
      }
      if (margin <= 3) closeGames++

      // Monthly breakdown
      if (match.played_at) {
        const mk = new Date(match.played_at).toLocaleDateString('en-AU', { month:'short', year:'2-digit' })
        if (!monthlyStats[mk]) monthlyStats[mk] = { wins: 0, losses: 0, label: mk, date: new Date(match.played_at) }
        if (won) monthlyStats[mk].wins++; else monthlyStats[mk].losses++
      }

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
    })).sort((a, b) => b.wins - a.wins)
    const bestPartner = partnerList[0] || null
    const nemesis = oppList.filter(o => o.losses > 0).sort((a, b) => b.losses - a.losses)[0]
    const victim  = oppList.filter(o => o.wins  > 0).sort((a, b) => b.wins  - a.wins )[0]

    // Opponents who have never beaten you / you've never beaten
    const undefeatedAgainst = oppList.filter(o => o.losses === 0 && o.wins > 0)
    const yetToBeat         = oppList.filter(o => o.wins === 0 && o.losses > 0)

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

    // Trend: compare win rate of last 5 vs previous 5
    let trend = null
    if (form.length >= 6) {
      const recent5  = form.slice(0, 5).filter(r => r === 'W').length
      const earlier5 = form.slice(5, 10).filter(r => r === 'W').length
      if (recent5 > earlier5) trend = 'up'
      else if (recent5 < earlier5) trend = 'down'
      else trend = 'flat'
    }

    // Monthly list — last 6 months, oldest first
    const monthlyList = Object.values(monthlyStats)
      .sort((a, b) => a.date - b.date)
      .slice(-6)

    // Best & worst month
    const bestMonth  = [...monthlyList].sort((a, b) => {
      const ra = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0
      const rb = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0
      return rb - ra
    })[0] || null

    return {
      wins, losses, pointsFor, pointsAgainst, total: playerMatches.length,
      bestPartner, partnerList, opponents: oppList, nemesis, victim, form, streak, streakType,
      avgScore: playerMatches.length > 0 ? (pointsFor / playerMatches.length).toFixed(1) : '0.0',
      avgConceded: playerMatches.length > 0 ? (pointsAgainst / playerMatches.length).toFixed(1) : '0.0',
      biggestWin, biggestLoss, last30, trend,
      doublesWins, doublesLosses, singlesWins, singlesLosses,
      avgWinMargin:  winMarginCount  > 0 ? (winMarginTotal  / winMarginCount ).toFixed(1) : null,
      avgLossMargin: lossMarginCount > 0 ? (lossMarginTotal / lossMarginCount).toFixed(1) : null,
      closeGames, dominantWins,
      monthlyList, bestMonth,
      undefeatedAgainst, yetToBeat,
      pointsDiff: pointsFor - pointsAgainst,
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

  async function renameSession(sId, name) {
    if (!name.trim()) return
    const { error } = await supabase.from('sessions').update({ name: name.trim() }).eq('id', sId)
    if (error) { showToast('Error renaming session'); return }
    setEditingSessionId(null)
    showToast('Session renamed')
    fetchAll()
  }

  async function endSession(sId) {
    if (!(await confirmDialog('End this session?'))) return
    const { error } = await supabase
      .from('sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sId)
    if (error) { showToast('Error ending session'); return }
    showToast('Session ended')
    fetchAll()
  }

  async function reopenSession(sId) {
    const { data: active } = await supabase
      .from('sessions').select('id, name').eq('club_id', clubId).eq('status', 'active').maybeSingle()
    if (active && active.id !== sId) {
      showToast(`Close "${active.name}" first before reopening another`)
      return
    }
    const { error } = await supabase.from('sessions').update({ status: 'active', ended_at: null }).eq('id', sId)
    if (error) { showToast('Error reopening session'); return }
    showToast('Session reopened!')
    navigate(`/club/${clubId}/session/${sId}/rotation`)
  }

  async function deleteMatch(mId) {
    if (!(await confirmDialog('Delete this match? This cannot be undone.'))) return
    await supabase.from('match_players').delete().eq('match_id', mId)
    const { error } = await supabase.from('matches').delete().eq('id', mId)
    if (error) { showToast('Error deleting match'); return }
    showToast('Match deleted')
    fetchAll()
  }

  async function deleteSession(sId) {
    if (!(await confirmDialog('Delete this session? This cannot be undone.'))) return
    await supabase.from('rotation_matches').delete().eq('session_id', sId)
    const { data, error } = await supabase.from('sessions').delete().eq('id', sId).select()
    if (error) { showToast('Error: ' + error.message); return }
    if (!data || data.length === 0) { showToast('Permission denied — see console'); console.error('Session delete blocked by RLS for id:', sId); return }
    showToast('Session deleted')
    fetchAll()
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
        <div>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:700, color:'var(--text)' }}>{club?.name}</div>
          <div style={{ fontSize:11, color:'var(--text3)', fontWeight:500, marginTop:2 }}>
            {{ history:'Match History', leaderboard:'Leaderboard', stats:'Player Stats', sessions:'Sessions' }[tab] || 'Stats'}
          </div>
        </div>
      </div>

      <div className="content" style={{ paddingTop:12, paddingBottom:90 }}>

        {loading && <div style={{ color:'var(--text3)', fontSize:14, padding:'20px 0' }}>Loading…</div>}

        {/* Match History */}
        {!loading && tab === 'history' && (() => {
          if (matches.length === 0) return (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>No matches yet.<br />Start a session to record matches.</p>
            </div>
          )

          // Group matches by calendar date
          const groups = []
          const seen = {}
          matches.forEach(match => {
            const dk = match.played_at ? new Date(match.played_at).toDateString() : 'Unknown'
            if (!seen[dk]) { seen[dk] = []; groups.push({ dk, list: seen[dk] }) }
            seen[dk].push(match)
          })

          const isOpen = (dk, idx) => openDates === null ? idx === 0 : openDates.has(dk)

          const toggle = (dk, idx) => {
            if (openDates === null) {
              if (idx === 0) setOpenDates(new Set())
              else setOpenDates(new Set([groups[0].dk, dk]))
            } else {
              const next = new Set(openDates)
              if (next.has(dk)) next.delete(dk); else next.add(dk)
              setOpenDates(next)
            }
          }

          return groups.map(({ dk, list }, gIdx) => {
            const open = isOpen(dk, gIdx)
            const label = dk === 'Unknown' ? 'Unknown date'
              : new Date(dk).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short', year:'numeric' })

            return (
              <div key={dk} style={{ marginBottom: open ? 8 : 0 }}>
                {/* Date header — tappable */}
                <button onClick={() => toggle(dk, gIdx)} style={{
                  width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                  background:'none', border:'none', borderBottom: open ? '0.5px solid var(--border2)' : '0.5px solid var(--border)',
                  padding:'10px 0', cursor:'pointer', marginBottom: open ? 0 : 4
                }}>
                  <span style={{ fontSize:13, fontWeight:700, color: open ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>{list.length} match{list.length !== 1 ? 'es' : ''}</span>
                    <span style={{ fontSize:12, color:'var(--text3)', transform: open ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform 0.2s' }}>▾</span>
                  </div>
                </button>

                {/* Match rows */}
                {open && list.map(match => {
                  const t1Won = match.winner_side === 'team1'
                  const winnerNames = getTeam(match, t1Won ? 'team1' : 'team2').map(p => shortName(p.profiles?.full_name)).join(' / ')
                  const loserNames  = getTeam(match, t1Won ? 'team2' : 'team1').map(p => shortName(p.profiles?.full_name)).join(' / ')
                  const winScore    = t1Won ? match.team1_score : match.team2_score
                  const loseScore   = t1Won ? match.team2_score : match.team1_score
                  const badge = getStatusBadge(match.status)
                  return (
                    <div key={match.id} style={{ padding:'10px 0', borderBottom:'0.5px solid var(--border)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{
                          flex:1, fontSize:13, fontWeight:600, color:'var(--text)',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                        }}>{winnerNames}</div>
                        <div style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, whiteSpace:'nowrap', textAlign:'center', flexShrink:0 }}>
                          <span style={{ color:'var(--accent)' }}>{winScore}</span>
                          <span style={{ color:'var(--text3)', margin:'0 3px' }}>–</span>
                          <span style={{ color:'#ff5c5c' }}>{loseScore}</span>
                        </div>
                        <div style={{
                          flex:1, fontSize:13, fontWeight:400, color:'var(--text2)',
                          textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                        }}>{loserNames}</div>
                        {isModerator && (
                          <button
                            onClick={() => deleteMatch(match.id)}
                            style={{
                              background:'none', border:'none', cursor:'pointer',
                              color:'var(--text3)', fontSize:16, padding:'0 2px', flexShrink:0,
                              lineHeight:1
                            }}
                            title="Delete match">🗑</button>
                        )}
                      </div>
                      {badge && (
                        <div style={{ marginTop:3, textAlign:'right' }}>
                          <span style={{ fontSize:11, fontWeight:600, color:badge.color }}>{badge.label}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })
        })()}

        {/* Leaderboard */}
        {!loading && tab === 'leaderboard' && <>

          {/* Rankings */}
          {(() => {
            const ranked = leaderboard.filter(p => p.wins + p.losses > 0)
            if (ranked.length === 0) return <div className="empty"><p>No confirmed matches yet</p></div>
            const medals = ['🥇','🥈','🥉']
            const visible = showAllLeaders ? ranked : ranked.slice(0, 3)
            return <>
              {visible.map((p, i) => {
                const total = p.wins + p.losses
                const rate = Math.round(p.wins / total * 100)
                return (
                  <div key={p.id} style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'8px 10px', marginBottom:4,
                    background:'var(--bg2)', border:'0.5px solid var(--border)',
                    borderRadius:'var(--radius-sm)', cursor:'pointer'
                  }} onClick={() => { setSelectedPlayer(p.id); setTab('stats') }}>
                    <div style={{ fontSize:15, width:22, textAlign:'center', flexShrink:0 }}>
                      {i < 3 ? medals[i] : <span style={{ fontSize:13, color:'var(--text3)', fontWeight:600 }}>#{i+1}</span>}
                    </div>
                    <div style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {properCase(p.name)}{p.streakType === 'W' && p.streak >= 3 && ' 🔥'}
                    </div>
                    <div style={{ fontSize:13, color:'var(--text2)', whiteSpace:'nowrap', flexShrink:0 }}>
                      {p.wins}W · {p.losses}L · <span style={{ color: rate >= 50 ? 'var(--accent)' : '#ff5c5c', fontWeight:600 }}>{rate}%</span>
                    </div>
                  </div>
                )
              })}
              {ranked.length > 3 && (
                <button onClick={() => setShowAllLeaders(v => !v)} style={{
                  background:'none', border:'none', color:'var(--accent)', fontSize:13,
                  cursor:'pointer', padding:'4px 0', width:'100%', textAlign:'center', marginBottom:4
                }}>
                  {showAllLeaders ? '▲ Show less' : `▼ Show ${ranked.length - 3} more`}
                </button>
              )}
            </>
          })()}

          {/* Best Pairs */}
          {partnerships.length > 0 && <>
            <hr className="divider" />
            <div className="section-label">Best Pairs</div>
            {partnerships.slice(0, showAllPairs ? partnerships.length : 3).map((pair, i) => {
              const medals = ['🥇','🥈','🥉']
              return (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'8px 10px', marginBottom:4,
                  background:'var(--bg2)', border:'0.5px solid var(--border)',
                  borderRadius:'var(--radius-sm)'
                }}>
                  <div style={{ fontSize:15, width:22, flexShrink:0 }}>{i < 3 ? medals[i] : <span style={{ fontSize:13, color:'var(--text3)', fontWeight:600 }}>#{i+1}</span>}</div>
                  <div style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {pair.names.map(n => shortName(n)).join(' · ')}
                  </div>
                  <div style={{ fontSize:13, color:'var(--text2)', whiteSpace:'nowrap', flexShrink:0 }}>
                    {pair.wins}W · {pair.losses}L · <span style={{ color:'var(--accent)', fontWeight:600 }}>{pair.rate}%</span>
                  </div>
                </div>
              )
            })}
            {partnerships.length > 3 && (
              <button onClick={() => setShowAllPairs(v => !v)} style={{
                background:'none', border:'none', color:'var(--accent)', fontSize:13,
                cursor:'pointer', padding:'4px 0', width:'100%', textAlign:'center'
              }}>
                {showAllPairs ? '▲ Show less' : `▼ Show ${partnerships.length - 3} more`}
              </button>
            )}
          </>}

          {/* Club Records — bottom */}
          {clubRecords && <>
            <hr className="divider" />
            <div className="section-label">Club Records</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
              {clubRecords.topPlayer && (
                <div style={{ padding:'8px 10px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)' }}>
                  <div style={{ fontSize:13, color:'var(--text2)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    🏆 Most Wins <span style={{ color:'var(--accent)', fontWeight:700 }}>{clubRecords.topPlayer.wins}W</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>{shortName(clubRecords.topPlayer.name)}</div>
                </div>
              )}
              {clubRecords.topStreak && (
                <div style={{ padding:'8px 10px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)' }}>
                  <div style={{ fontSize:13, color:'var(--text2)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    🔥 Streak <span style={{ color:'var(--accent)', fontWeight:700 }}>{clubRecords.topStreak.streak}W</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>{shortName(clubRecords.topStreak.name)}</div>
                </div>
              )}
              {clubRecords.highScore > 0 && (
                <div style={{ padding:'8px 10px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)' }}>
                  <div style={{ fontSize:13, color:'var(--text2)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    🎯 High Score <span style={{ color:'var(--accent)', fontWeight:700 }}>{clubRecords.highScore}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>
                    {(() => {
                      const m = confirmedMatches.find(m => Math.max(m.team1_score, m.team2_score) === clubRecords.highScore)
                      if (!m) return '—'
                      const side = m.team1_score === clubRecords.highScore ? 'team1' : 'team2'
                      return getTeam(m, side).map(p => shortName(p.profiles?.full_name)).join(' / ') || '—'
                    })()}
                  </div>
                </div>
              )}
              {clubRecords.biggestMargin > 0 && (
                <div style={{ padding:'8px 10px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)' }}>
                  <div style={{ fontSize:13, color:'var(--text2)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    ⚡ Biggest Win <span style={{ color:'var(--accent)', fontWeight:700, fontFamily:'monospace' }}>{clubRecords.biggestMarginScore}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>
                    {(() => {
                      let best = null, bestMargin = 0
                      confirmedMatches.forEach(m => {
                        const margin = Math.abs(m.team1_score - m.team2_score)
                        if (margin > bestMargin) { bestMargin = margin; best = getTeam(m, m.winner_side).map(p => shortName(p.profiles?.full_name)).join(' / ') }
                      })
                      return best || '—'
                    })()}
                  </div>
                </div>
              )}
            </div>
          </>}
        </>}

        {/* Stats */}
        {!loading && tab === 'stats' && <>

          {/* Dropdown */}
          <div style={{ position:'relative', marginBottom:16 }}>
            <select value={selectedPlayer || ''} onChange={e => setSelectedPlayer(e.target.value || null)}
              style={{
                width:'100%', padding:'9px 36px 9px 12px',
                background:'var(--bg2)', border:'0.5px solid var(--border2)',
                borderRadius:'var(--radius-sm)', color: selectedPlayer ? 'var(--text)' : 'var(--text3)',
                fontSize:13, fontFamily:'Inter,sans-serif', cursor:'pointer', outline:'none',
                appearance:'none', WebkitAppearance:'none'
              }}>
              <option value=''>Select a player…</option>
              {members.map(m => <option key={m.id} value={m.id}>{properCase(m.full_name)}</option>)}
            </select>
            <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none', fontSize:12 }}>▾</span>
          </div>

          {!selectedPlayer && (
            <div className="empty"><p>Select a player to see their stats</p></div>
          )}

          {selectedPlayer && (() => {
            const s = getPlayerStats(selectedPlayer)
            const rate = s.total > 0 ? Math.round(s.wins / s.total * 100) : 0
            const playerName = properCase(members.find(m => m.id === selectedPlayer)?.full_name || '')
            const rank = leaderboard.filter(p => p.wins + p.losses > 0).findIndex(p => p.id === selectedPlayer)
            const rankTotal = leaderboard.filter(p => p.wins + p.losses > 0).length

            const row = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', marginBottom:4, background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)' }
            const lbl = { fontSize:13, color:'var(--text2)', fontWeight:500 }
            const val = (color) => ({ fontSize:13, fontWeight:700, color, whiteSpace:'nowrap' })

            const trendIcon = s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→'
            const trendColor = s.trend === 'up' ? 'var(--accent)' : s.trend === 'down' ? '#ff5c5c' : 'var(--text3)'
            const trendLabel = s.trend === 'up' ? 'Improving' : s.trend === 'down' ? 'Declining' : 'Steady'

            const hasDoubles = s.doublesWins + s.doublesLosses > 0
            const hasSingles = s.singlesWins + s.singlesLosses > 0

            const StatCard = ({ label, value, sub, color='var(--accent)' }) => (
              <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:18, fontWeight:800, color, lineHeight:1.1 }}>{value}</div>
                {sub && <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>{sub}</div>}
              </div>
            )

            return <>

              {/* ── Profile header ── */}
              <div style={{
                background:'var(--bg2)', border:'0.5px solid var(--border)',
                borderLeft:'4px solid var(--accent)',
                borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:12,
                display:'flex', alignItems:'center', gap:14,
              }}>
                <div style={{
                  width:46, height:46, borderRadius:'50%', flexShrink:0,
                  background:'var(--accent-dim)', border:'2px solid var(--accent)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:20, fontWeight:800, color:'var(--accent)',
                }}>
                  {playerName[0] || '?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {playerName}
                  </div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>
                    {s.total} match{s.total !== 1 ? 'es' : ''} · {s.wins}W {s.losses}L
                    {s.pointsDiff !== 0 && <span style={{ marginLeft:6, color: s.pointsDiff > 0 ? 'var(--accent)' : '#ff5c5c' }}>
                      {s.pointsDiff > 0 ? '+' : ''}{s.pointsDiff} pts
                    </span>}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:26, fontWeight:900, color: rate >= 50 ? 'var(--accent)' : '#ff5c5c', lineHeight:1 }}>
                    {s.total > 0 ? `${rate}%` : '—'}
                  </div>
                  {rank >= 0 && <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>#{rank+1} of {rankTotal}</div>}
                </div>
              </div>

              {/* ── Headline grid ── */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                <StatCard label="Current Streak"
                  value={s.streak > 0 ? `${s.streak}${s.streakType}` : '—'}
                  color={s.streakType === 'W' ? 'var(--accent)' : s.streak > 0 ? '#ff5c5c' : 'var(--text3)'} />
                <StatCard label="Pts Per Game"
                  value={s.avgScore}
                  sub={`${s.avgConceded} conceded`} />
                {s.last30.total > 0 && <StatCard label="Last 30 Days"
                  value={`${s.last30.rate}%`}
                  sub={`${s.last30.wins}W · ${s.last30.losses}L`}
                  color={s.last30.rate >= 50 ? 'var(--accent)' : '#ff5c5c'} />}
                {s.biggestWin && <StatCard label="Best Win"
                  value={`${s.biggestWin.myScore}–${s.biggestWin.oppScore}`}
                  sub={`+${s.biggestWin.margin} margin`} />}
              </div>

              {/* ── Match type breakdown ── */}
              {(hasDoubles || hasSingles) && <>
                <hr className="divider" style={{ margin:'10px 0 8px' }} />
                <div className="section-label">Match Type</div>
                <div style={{ display:'grid', gridTemplateColumns: hasDoubles && hasSingles ? '1fr 1fr' : '1fr', gap:6, marginBottom:6 }}>
                  {hasDoubles && (() => {
                    const r = Math.round(s.doublesWins / (s.doublesWins + s.doublesLosses) * 100)
                    return <StatCard label="Doubles" value={`${r}%`} sub={`${s.doublesWins}W · ${s.doublesLosses}L`} color={r >= 50 ? 'var(--accent)' : '#ff5c5c'} />
                  })()}
                  {hasSingles && (() => {
                    const r = Math.round(s.singlesWins / (s.singlesWins + s.singlesLosses) * 100)
                    return <StatCard label="Singles" value={`${r}%`} sub={`${s.singlesWins}W · ${s.singlesLosses}L`} color={r >= 50 ? 'var(--accent)' : '#ff5c5c'} />
                  })()}
                </div>
              </>}

              {/* ── Score DNA ── */}
              {s.total > 0 && <>
                <hr className="divider" style={{ margin:'10px 0 8px' }} />
                <div className="section-label">Score DNA</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                  {s.avgWinMargin && <StatCard label="Avg Win Margin" value={`+${s.avgWinMargin}`} sub={`${s.dominantWins} dominant (≥10)`} />}
                  {s.avgLossMargin && <StatCard label="Avg Loss Margin" value={`–${s.avgLossMargin}`}
                    sub={s.biggestLoss ? `Worst: ${s.biggestLoss.myScore}–${s.biggestLoss.oppScore}` : undefined}
                    color="#ff5c5c" />}
                  <StatCard label="Close Games"
                    value={s.closeGames}
                    sub={`${s.total > 0 ? Math.round(s.closeGames / s.total * 100) : 0}% of matches (≤3 pts)`} />
                  <StatCard label="Points Diff"
                    value={`${s.pointsDiff > 0 ? '+' : ''}${s.pointsDiff}`}
                    sub={`${s.pointsFor} for · ${s.pointsAgainst} against`}
                    color={s.pointsDiff >= 0 ? 'var(--accent)' : '#ff5c5c'} />
                </div>
              </>}

              {/* ── Recent form ── */}
              {s.form.length > 0 && <>
                <hr className="divider" style={{ margin:'10px 0 8px' }} />
                <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 12px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em' }}>Recent Form</div>
                    {s.trend && <div style={{ fontSize:11, fontWeight:700, color: trendColor }}>{trendIcon} {trendLabel}</div>}
                  </div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {s.form.map((r, i) => (
                      <div key={i} style={{
                        width:26, height:26, borderRadius:99,
                        background: r === 'W' ? 'rgba(122,164,196,0.12)' : 'rgba(255,92,92,0.12)',
                        border:`1.5px solid ${r === 'W' ? 'var(--accent)' : '#ff5c5c'}`,
                        color: r === 'W' ? 'var(--accent)' : '#ff5c5c',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:11, fontWeight:700, opacity: i >= 5 ? 0.5 : 1,
                      }}>{r}</div>
                    ))}
                  </div>
                  {s.form.length >= 6 && <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>Solid = last 5 · Faded = previous 5</div>}
                </div>
              </>}

              {/* ── Monthly Activity ── */}
              {s.monthlyList.length > 0 && <>
                <hr className="divider" style={{ margin:'10px 0 8px' }} />
                <div className="section-label">Monthly Activity</div>
                <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 12px', marginBottom:4 }}>
                  <div style={{ display:'flex', gap:6, alignItems:'flex-end', justifyContent:'space-between' }}>
                    {s.monthlyList.map(mo => {
                      const total = mo.wins + mo.losses
                      const r = total > 0 ? Math.round(mo.wins / total * 100) : 0
                      const isBest = s.bestMonth?.label === mo.label
                      return (
                        <div key={mo.label} style={{ flex:1, textAlign:'center' }}>
                          <div style={{ fontSize:9, color: isBest ? 'var(--accent)' : 'var(--text3)', fontWeight: isBest ? 700 : 400, marginBottom:4 }}>
                            {mo.label.split(' ')[0]}
                          </div>
                          <div style={{ height:36, background:'var(--bg3)', borderRadius:4, overflow:'hidden', position:'relative', display:'flex', alignItems:'flex-end' }}>
                            <div style={{ width:'100%', height:`${r}%`, background: isBest ? 'var(--accent)' : r >= 50 ? 'rgba(122,164,196,0.5)' : 'rgba(255,92,92,0.4)', borderRadius:4, transition:'height 0.3s', minHeight: total > 0 ? 4 : 0 }} />
                          </div>
                          <div style={{ fontSize:9, color:'var(--text3)', marginTop:3 }}>{mo.wins}W{mo.losses > 0 ? ` ${mo.losses}L` : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                  {s.bestMonth && (
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:8, textAlign:'center' }}>
                      Best month: <span style={{ color:'var(--accent)', fontWeight:600 }}>{s.bestMonth.label}</span>
                      {' '}({Math.round(s.bestMonth.wins / (s.bestMonth.wins + s.bestMonth.losses) * 100)}% win rate)
                    </div>
                  )}
                </div>
              </>}

              {/* ── Relationships ── */}
              {(s.bestPartner || s.nemesis || s.victim) && <>
                <hr className="divider" style={{ margin:'10px 0 8px' }} />
                <div className="section-label">Relationships</div>
                {s.bestPartner && (
                  <div style={row}>
                    <span style={lbl}>🤝 Best Partner</span>
                    <span style={{ fontSize:13, color:'var(--text)', whiteSpace:'nowrap' }}>
                      <span style={{ fontWeight:600, color:'var(--accent)' }}>{shortName(s.bestPartner.name)}</span>
                      <span style={{ color:'var(--text3)', marginLeft:6 }}>{s.bestPartner.wins}W · {s.bestPartner.losses}L · {s.bestPartner.rate}%</span>
                    </span>
                  </div>
                )}
                {s.nemesis && (
                  <div style={row}>
                    <span style={lbl}>😤 Nemesis</span>
                    <span style={{ fontSize:13, color:'var(--text)', whiteSpace:'nowrap' }}>
                      <span style={{ fontWeight:600, color:'#ff5c5c' }}>{shortName(s.nemesis.name)}</span>
                      <span style={{ color:'var(--text3)', marginLeft:6 }}>{s.nemesis.wins}W · {s.nemesis.losses}L</span>
                    </span>
                  </div>
                )}
                {s.victim && s.victim.name !== s.nemesis?.name && (
                  <div style={row}>
                    <span style={lbl}>🎯 Fav Opponent</span>
                    <span style={{ fontSize:13, color:'var(--text)', whiteSpace:'nowrap' }}>
                      <span style={{ fontWeight:600, color:'var(--accent)' }}>{shortName(s.victim.name)}</span>
                      <span style={{ color:'var(--text3)', marginLeft:6 }}>{s.victim.wins}W · {s.victim.losses}L</span>
                    </span>
                  </div>
                )}
                {s.undefeatedAgainst.length > 0 && (
                  <div style={row}>
                    <span style={lbl}>🔒 Unbeaten vs</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--accent)' }}>
                      {s.undefeatedAgainst.map(o => shortName(o.name)).join(', ')}
                    </span>
                  </div>
                )}
                {s.yetToBeat.length > 0 && (
                  <div style={row}>
                    <span style={lbl}>🧱 Yet to beat</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'#ff5c5c' }}>
                      {s.yetToBeat.map(o => shortName(o.name)).join(', ')}
                    </span>
                  </div>
                )}
              </>}

              {/* ── All Partners ── */}
              {s.partnerList.length > 1 && <>
                <hr className="divider" style={{ margin:'10px 0 8px' }} />
                <div className="section-label">All Partners</div>
                {s.partnerList.slice(0, showAllPartners ? undefined : 3).map(p => {
                  const winPct = p.total > 0 ? Math.round(p.wins / p.total * 100) : 0
                  return (
                    <div key={p.name} style={{ ...row }}>
                      <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{shortName(p.name)}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:48, height:4, borderRadius:99, background:'var(--bg3)', overflow:'hidden', flexShrink:0 }}>
                          <div style={{ width:`${winPct}%`, height:'100%', background: winPct >= 50 ? 'var(--accent)' : '#ff5c5c', borderRadius:99 }} />
                        </div>
                        <span style={val(winPct >= 50 ? 'var(--accent)' : '#ff5c5c')}>
                          {p.wins}W · {p.losses}L · {winPct}%
                        </span>
                      </div>
                    </div>
                  )
                })}
                {s.partnerList.length > 3 && (
                  <button onClick={() => setShowAllPartners(v => !v)} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:13, cursor:'pointer', padding:'4px 0', width:'100%', textAlign:'center' }}>
                    {showAllPartners ? '▲ Show less' : `▼ Show ${s.partnerList.length - 3} more`}
                  </button>
                )}
              </>}

              {/* ── Head-to-Head ── */}
              {s.opponents.length > 0 && <>
                <hr className="divider" style={{ margin:'10px 0 8px' }} />
                <div className="section-label">Head-to-Head</div>
                {[...s.opponents].sort((a,b) => (b.wins+b.losses)-(a.wins+a.losses))
                  .slice(0, showAllH2H ? undefined : 5)
                  .map(opp => {
                    const total = opp.wins + opp.losses
                    const winPct = total > 0 ? Math.round(opp.wins / total * 100) : 0
                    return (
                      <div key={opp.name} style={{ ...row }}>
                        <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>vs {shortName(opp.name)}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:48, height:4, borderRadius:99, background:'var(--bg3)', overflow:'hidden', flexShrink:0 }}>
                            <div style={{ width:`${winPct}%`, height:'100%', background: winPct >= 50 ? 'var(--accent)' : '#ff5c5c', borderRadius:99 }} />
                          </div>
                          <span style={val(opp.wins >= opp.losses ? 'var(--accent)' : '#ff5c5c')}>
                            {opp.wins}W · {opp.losses}L
                          </span>
                        </div>
                      </div>
                    )
                  })}
                {s.opponents.length > 5 && (
                  <button onClick={() => setShowAllH2H(v => !v)} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:13, cursor:'pointer', padding:'4px 0', width:'100%', textAlign:'center' }}>
                    {showAllH2H ? '▲ Show less' : `▼ Show ${s.opponents.length - 5} more`}
                  </button>
                )}
              </>}
            </>
          })()}
        </>}

        {/* Sessions */}
        {!loading && tab === 'sessions' && (() => {
          if (sessions.length === 0) return (
            <div className="empty">
              <div className="empty-icon">📆</div>
              <p>No sessions yet.</p>
            </div>
          )

          const isOpen = (id, idx) => openSessions === null ? idx === 0 : openSessions.has(id)
          const toggle = (id, idx) => {
            if (openSessions === null) {
              if (idx === 0) setOpenSessions(new Set())
              else setOpenSessions(new Set([sessions[0].id, id]))
            } else {
              const next = new Set(openSessions)
              if (next.has(id)) next.delete(id); else next.add(id)
              setOpenSessions(next)
            }
          }

          const row = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', marginBottom:4 }
          const lbl = { fontSize:13, color:'var(--text2)', fontWeight:500 }
          const val = (color='var(--accent)') => ({ fontSize:13, fontWeight:700, color, whiteSpace:'nowrap' })

          return sessions.map((s, sIdx) => {
            const sessionMatches = matches.filter(m => m.session_id === s.id)
            const confirmed = sessionMatches.filter(m => m.status === 'confirmed')
            const playerWins = {}
            confirmed.forEach(match => {
              const winners = match.match_players?.filter(p => p.side === match.winner_side) || []
              winners.forEach(p => {
                if (!playerWins[p.user_id]) playerWins[p.user_id] = { name: p.profiles?.full_name, wins: 0 }
                playerWins[p.user_id].wins++
              })
            })
            const mvp = Object.values(playerWins).sort((a, b) => b.wins - a.wins)[0]
            const duration = s.ended_at
              ? (() => {
                  const mins = Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000)
                  return mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`
                })()
              : null
            const open = isOpen(s.id, sIdx)

            return (
              <div key={s.id} style={{ marginBottom: open ? 10 : 0 }}>
                {/* Session header — tappable */}
                <button onClick={() => toggle(s.id, sIdx)} style={{
                  width:'100%', display:'flex', alignItems:'center', gap:8,
                  padding:'9px 10px',
                  background: s.status === 'active' ? 'rgba(122,164,196,0.07)' : 'var(--bg2)',
                  border:`0.5px solid ${s.status === 'active' ? 'rgba(122,164,196,0.3)' : 'var(--border)'}`,
                  borderRadius: open ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)',
                  cursor:'pointer', marginBottom:0
                }}>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{s.name}</span>
                    {s.status === 'active' && <span style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginLeft:8 }}>● LIVE</span>}
                  </div>
                  <span style={{ fontSize:12, color:'var(--text3)', whiteSpace:'nowrap' }}>
                    {sessionMatches.length} match{sessionMatches.length !== 1 ? 'es' : ''}
                    {duration && ` · ${duration}`}
                  </span>
                  <span style={{ fontSize:12, color:'var(--text3)', transform: open ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform 0.2s' }}>▾</span>
                </button>

                {/* Expanded content */}
                {open && (
                  <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderTop:'none', borderRadius:'0 0 var(--radius-sm) var(--radius-sm)', padding:'8px 10px 10px' }}>

                    {/* Summary rows */}
                    {mvp && (
                      <div style={{ ...row, marginBottom:4 }}>
                        <span style={lbl}>MVP</span>
                        <span style={val()}>{shortName(mvp.name)} <span style={{ color:'var(--text3)', fontWeight:400 }}>· {mvp.wins}W</span></span>
                      </div>
                    )}

                    {/* View Summary — visible to all */}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width:'100%', fontSize:12, marginBottom:6 }}
                      onClick={e => { e.stopPropagation(); navigate(`/club/${clubId}/session/${s.id}`) }}>
                      📊 View Summary
                    </button>

                    {/* Moderator actions */}
                    {isModerator && (
                      <div style={{ marginBottom: sessionMatches.length > 0 ? 8 : 4 }}>

                        {/* Edit name */}
                        {editingSessionId === s.id ? (
                          <div style={{ display:'flex', gap:6, marginBottom:4 }}>
                            <input
                              className="input"
                              value={editingSessionName}
                              onChange={e => setEditingSessionName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && renameSession(s.id, editingSessionName)}
                              style={{ flex:1, padding:'6px 10px', fontSize:13 }}
                              autoFocus
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => renameSession(s.id, editingSessionName)}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingSessionId(null)}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display:'flex', gap:6, marginBottom:4 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ flex:1, fontSize:12 }}
                              onClick={e => { e.stopPropagation(); setEditingSessionId(s.id); setEditingSessionName(s.name) }}>
                              ✏ Edit Name
                            </button>
                            {s.status === 'active' && (
                              <button
                                className="btn btn-danger btn-sm"
                                style={{ flex:1, fontSize:12 }}
                                onClick={e => { e.stopPropagation(); endSession(s.id) }}>
                                End Session
                              </button>
                            )}
                            {s.status === 'ended' && (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ flex:1, fontSize:12 }}
                                onClick={e => { e.stopPropagation(); reopenSession(s.id) }}>
                                ↩ Reopen
                              </button>
                            )}
                          </div>
                        )}

                        {/* Delete — 0 matches only */}
                        {sessionMatches.length === 0 && s.status !== 'active' && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                            className="btn btn-danger btn-sm"
                            style={{ width:'100%', fontSize:12 }}>
                            🗑 Delete Session
                          </button>
                        )}
                      </div>
                    )}

                    {/* Match rows */}
                    {sessionMatches.length > 0 && <>
                      <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', margin:'8px 0 4px' }}>Matches</div>
                      {sessionMatches.map(match => {
                        const t1Won = match.winner_side === 'team1'
                        const winnerNames = getTeam(match, t1Won ? 'team1' : 'team2').map(p => shortName(p.profiles?.full_name)).join(' / ')
                        const loserNames  = getTeam(match, t1Won ? 'team2' : 'team1').map(p => shortName(p.profiles?.full_name)).join(' / ')
                        const winScore    = t1Won ? match.team1_score : match.team2_score
                        const loseScore   = t1Won ? match.team2_score : match.team1_score
                        const badge = getStatusBadge(match.status)
                        return (
                          <div key={match.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 0', borderBottom:'0.5px solid var(--border)' }}>
                            <div style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{winnerNames}</div>
                            <div style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, flexShrink:0 }}>
                              <span style={{ color:'var(--accent)' }}>{winScore}</span>
                              <span style={{ color:'var(--text3)', margin:'0 3px' }}>–</span>
                              <span style={{ color:'#ff5c5c' }}>{loseScore}</span>
                            </div>
                            <div style={{ flex:1, fontSize:13, color:'var(--text2)', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{loserNames}</div>
                            {badge && <span style={{ fontSize:10, color:badge.color, flexShrink:0 }}>{badge.label}</span>}
                            {isModerator && (
                              <button
                                onClick={e => { e.stopPropagation(); deleteMatch(match.id) }}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:15, padding:'0 2px', flexShrink:0, lineHeight:1 }}
                                title="Delete match">🗑</button>
                            )}
                          </div>
                        )
                      })}
                    </>}
                  </div>
                )}
              </div>
            )
          })
        })()}

      </div>

      <GroupNav clubId={clubId} isMod={isModerator} activeTab="stats" />

      <Toast message={toast} />
      {confirmModal}
    </div>
  )
}
