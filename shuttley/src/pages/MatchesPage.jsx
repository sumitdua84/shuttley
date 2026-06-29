import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import GroupNav from '../components/GroupNav'
import GroupWorldHeader from '../components/GroupWorldHeader'
import Toast from '../components/Toast'
import { useConfirm } from '../hooks/useConfirm'

const getMatchType = m => m.match_type || m.type || 'doubles'

export default function MatchesPage() {
  const { clubId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [matches, setMatches] = useState([])
  const [members, setMembers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [confirmDialog, confirmModal] = useConfirm()
  const [club, setClub] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [statsMode, setStatsMode] = useState('alltime') // 'alltime' | 'lastsession'
  const [showAllPairs, setShowAllPairs] = useState(false)
  const [isModerator, setIsModerator] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editingSessionName, setEditingSessionName] = useState('')

  useEffect(() => {
    if (location.state?.success) {
      showToast('Match submitted - awaiting opponent confirmation!')
    }
    window.history.replaceState({}, '')
    setSelectedPlayer(user.id)
    fetchAll()
  }, [clubId])

  useEffect(() => {
    if (sessions.length > 0 && !selectedSession) {
      setSelectedSession(sessions[0])
    }
  }, [sessions])

  async function fetchAll() {
    const { data: clubData } = await supabase.from('clubs').select('*').eq('id', clubId).single()
    setClub(clubData)

    const { data: mems } = await supabase
      .from('memberships')
      .select('user_id, is_guest, profiles(id, full_name, avatar_url)')
      .eq('club_id', clubId).eq('status', 'approved')
    const memberList = (mems || [])
      .map(m => m.profiles ? { ...m.profiles, is_guest: m.is_guest } : null)
      .filter(Boolean)
    // Guarantee logged-in user is always in the list
    if (memberList.length > 0 && !memberList.some(m => m.id === user.id)) {
      const { data: myProfile } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('id', user.id).single()
      if (myProfile) memberList.unshift({ ...myProfile, is_guest: false })
    }
    setMembers(memberList)

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
    if (status === 'pending') return { label:'Pending', color:'#ffc832', bg:'rgba(255,200,50,0.1)' }
    if (status === 'disputed') return { label:'Disputed', color:'#ff5c5c', bg:'rgba(255,92,92,0.1)' }
    return null
  }

  // Confirmed + pending both count for leaderboard (pending = played but awaiting opponent confirm)
  const confirmedMatches = matches.filter(m => m.status === 'confirmed' || m.status === 'pending')

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
        const aTotal = a.wins + a.losses
        const bTotal = b.wins + b.losses
        const aRanked = aTotal >= 10
        const bRanked = bTotal >= 10
        if (aRanked !== bRanked) return aRanked ? -1 : 1
        if (aTotal === 0 && bTotal === 0) return (a.name || '').localeCompare(b.name || '')
        const aRate = aTotal > 0 ? a.wins / aTotal : 0
        const bRate = bTotal > 0 ? b.wins / bTotal : 0
        if (Math.abs(bRate - aRate) > 0.0001) return bRate - aRate
        if (bTotal !== aTotal) return bTotal - aTotal
        if (b.wins !== a.wins) return b.wins - a.wins
        return (a.name || '').localeCompare(b.name || '')
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
    let closeGames = 0   // margin <= 3
    let dominantWins = 0 // margin >= 10
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

      if (getMatchType(match) === 'doubles') { if (won) doublesWins++; else doublesLosses++ }
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

      if (getMatchType(match) === 'doubles') {
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

    // Monthly list - last 6 months, oldest first
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
    confirmedMatches.filter(m => getMatchType(m) === 'doubles').forEach(match => {
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
      if (margin > biggestMargin) { biggestMargin = margin; biggestMarginScore = `${winScore} - ${loseScore}` }
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
    if (!data || data.length === 0) { showToast('Permission denied - see console'); console.error('Session delete blocked by RLS for id:', sId); return }
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
        <GroupWorldHeader
          clubId={clubId}
          groupName={club?.name}
          isMod={isModerator}
          activeTab="stats"
          subLabel="Stats"
          buildRoute={(targetClubId) => `/club/${targetClubId}/matches`}
        />
      </div>

      <div className="content" style={{ paddingTop:12, paddingBottom:90 }}>

        {loading && <div style={{ color:'var(--text3)', fontSize:14, padding:'20px 0' }}>Loading...</div>}

        {!loading && (
          <>
            {/*  Player selector  */}
            <div style={{ position:'relative', marginBottom:10 }}>
              {(() => {
                const selectablePlayers = members.filter(m => !m.is_guest && m.id)
                return (
                  <select
                    value={selectedPlayer || ''}
                    onChange={e => setSelectedPlayer(e.target.value)}
                    disabled={selectablePlayers.length === 0}
                    style={{
                      width:'100%', padding:'9px 36px 9px 12px',
                      background:'var(--bg2)', border:'0.5px solid var(--border2)',
                      borderRadius:'var(--radius-sm)', color: selectablePlayers.length === 0 ? 'var(--text3)' : 'var(--text)',
                      fontSize:13, fontFamily:'Inter,sans-serif', cursor: selectablePlayers.length === 0 ? 'default' : 'pointer',
                      outline:'none', appearance:'none', WebkitAppearance:'none',
                    }}>
                    {selectablePlayers.length === 0
                      ? <option value=''>No players found</option>
                      : selectablePlayers.map(m => (
                        <option key={m.id} value={m.id}>
                          {properCase(m.full_name)}{m.id === user.id ? ' (You)' : ''}
                        </option>
                      ))
                    }
                  </select>
                )
              })()}
              <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none', fontSize:12 }}>v</span>
            </div>

            {/*  Segmented control  */}
            <div style={{ display:'flex', gap:3, background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:3, marginBottom:16 }}>
              {[['alltime','All Time'],['lastsession','Last Session']].map(([mode, label]) => (
                <button key={mode} onClick={() => setStatsMode(mode)} style={{
                  flex:1, padding:'7px 0', border:'none', borderRadius:'var(--radius-sm)',
                  background: statsMode === mode ? 'var(--accent)' : 'none',
                  color: statsMode === mode ? '#fff' : 'var(--text2)',
                  fontSize:13, fontWeight: statsMode === mode ? 700 : 500,
                  cursor:'pointer', transition:'all 0.15s',
                }}>{label}</button>
              ))}
            </div>

            {/*  ALL TIME  */}
            {statsMode === 'alltime' && (() => {
              if (confirmedMatches.length === 0) return (
                <div className="empty">
                  <div className="empty-icon"></div>
                  <p>No matches yet.<br />Start a session to record matches.</p>
                </div>
              )

              const s = selectedPlayer ? getPlayerStats(selectedPlayer) : null
              const rate = s && s.total > 0 ? Math.round(s.wins / s.total * 100) : 0
              const playerName = properCase(members.find(m => m.id === selectedPlayer)?.full_name || '')
              const rankedPlayers = leaderboard.filter(p => p.wins + p.losses >= 10)
              const allPlayedPlayers = leaderboard.filter(p => p.wins + p.losses > 0)
              const rank = rankedPlayers.findIndex(p => p.id === selectedPlayer)

              const StatMini = ({ label, value, sub, color='var(--accent)' }) => (
                <div style={{ background:'var(--bg3)', borderRadius:'var(--radius-sm)', padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:18, fontWeight:800, color, lineHeight:1.1 }}>{value}</div>
                  {sub && <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>{sub}</div>}
                </div>
              )

              return (
                <>
                  {/*  Player Spotlight  */}
                  {s && (
                    <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', padding:'16px', marginBottom:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                        <div style={{
                          width:48, height:48, borderRadius:'50%', flexShrink:0,
                          background:'var(--accent-dim)', border:'2px solid var(--accent)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:20, fontWeight:800, color:'var(--accent)',
                        }}>{playerName[0] || '?'}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {playerName}
                            {selectedPlayer === user.id && <span style={{ fontSize:11, color:'var(--accent)', marginLeft:8, fontWeight:600 }}>You</span>}
                          </div>
                          <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                            {rank >= 0 ? `#${rank+1} of ${rankedPlayers.length} · ` : s.total > 0 && s.total < 10 ? `Unranked · ` : ''}{s.total} match{s.total !== 1 ? 'es' : ''}
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize:30, fontWeight:900, color: rate >= 50 ? 'var(--accent)' : '#ff5c5c', lineHeight:1 }}>
                            {s.total > 0 ? `${rate}%` : '-'}
                          </div>
                          <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>win rate</div>
                        </div>
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom: (s.streak > 0 || s.avgWinMargin || s.bestPartner || s.form.length > 0) ? 12 : 0 }}>
                        <StatMini label="Wins" value={s.wins} color="var(--accent)" />
                        <StatMini label="Losses" value={s.losses} color={s.losses > s.wins ? '#ff5c5c' : 'var(--text)'} />
                        <StatMini label="Pts Diff"
                          value={`${s.pointsDiff > 0 ? '+' : ''}${s.pointsDiff}`}
                          color={s.pointsDiff >= 0 ? 'var(--accent)' : '#ff5c5c'} />
                      </div>

                      {(s.streak > 0 || s.avgWinMargin || s.bestPartner) && (
                        <div style={{ borderTop:'0.5px solid var(--border)', paddingTop:10 }}>
                          {s.streak > 0 && (
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                              <span style={{ fontSize:12, color:'var(--text3)' }}>Current streak</span>
                              <span style={{ fontSize:13, fontWeight:700, color: s.streakType === 'W' ? 'var(--accent)' : '#ff5c5c' }}>
                                {s.streak}{s.streakType}{s.streakType === 'W' && s.streak >= 3 ? ' ' : ''}
                              </span>
                            </div>
                          )}
                          {s.avgWinMargin && (
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                              <span style={{ fontSize:12, color:'var(--text3)' }}>Avg win margin</span>
                              <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>+{s.avgWinMargin}</span>
                            </div>
                          )}
                          {s.bestPartner && (
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                              <span style={{ fontSize:12, color:'var(--text3)' }}>Best partner</span>
                              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                                {shortName(s.bestPartner.name)}
                                <span style={{ fontSize:11, color:'var(--text3)', marginLeft:6 }}>{s.bestPartner.wins}W / {s.bestPartner.rate}%</span>
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {s.form.length > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:4, paddingTop:10, borderTop:'0.5px solid var(--border)', marginTop:10 }}>
                          <span style={{ fontSize:11, color:'var(--text3)', marginRight:4, flexShrink:0 }}>Form</span>
                          {s.form.slice(0,8).map((r, i) => (
                            <div key={i} style={{
                              width:22, height:22, borderRadius:99,
                              background: r==='W' ? 'rgba(122,164,196,0.12)' : 'rgba(255,92,92,0.12)',
                              border:`1.5px solid ${r==='W' ? 'var(--accent)' : '#ff5c5c'}`,
                              color: r==='W' ? 'var(--accent)' : '#ff5c5c',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:10, fontWeight:700, opacity: i >= 5 ? 0.45 : 1,
                            }}>{r}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/*  Player Rankings  */}
                  {allPlayedPlayers.length > 0 && (
                    <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                      <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Player Rankings</div>
                      </div>
                      {allPlayedPlayers.map((p) => {
                        const isSelected = p.id === selectedPlayer
                        const total = p.wins + p.losses
                        const isRanked = total >= 10
                        const rankIdx = isRanked ? rankedPlayers.findIndex(r => r.id === p.id) : -1
                        const pct = total > 0 ? Math.round(p.wins / total * 100) : 0
                        const medals = ['1st','2nd','3rd']
                        return (
                          <div key={p.id} onClick={() => setSelectedPlayer(p.id)} style={{
                            display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                            background: isSelected ? 'var(--accent-dim)' : 'none',
                            borderBottom:'0.5px solid var(--border)', cursor:'pointer',
                          }}>
                            <div style={{ width:22, textAlign:'center', flexShrink:0, fontSize: isRanked && rankIdx < 3 ? 15 : 12, color: !isRanked || rankIdx >= 3 ? 'var(--text3)' : 'inherit', fontWeight: !isRanked || rankIdx >= 3 ? 600 : 'inherit' }}>
                              {isRanked ? (rankIdx < 3 ? medals[rankIdx] : `#${rankIdx+1}`) : '—'}
                            </div>
                            <div style={{ flex:1, fontSize:13, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--accent)' : isRanked ? 'var(--text)' : 'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {properCase(p.name)}{p.streakType === 'W' && p.streak >= 3 ? ' ' : ''}
                            </div>
                            <div style={{ fontSize:12, color:'var(--text2)', whiteSpace:'nowrap', flexShrink:0 }}>
                              {p.wins}W / {p.losses}L
                            </div>
                            <div style={{ width:38, textAlign:'right', flexShrink:0 }}>
                              <span style={{ fontSize:13, fontWeight:700, color: isRanked ? (pct >= 50 ? 'var(--accent)' : '#ff5c5c') : 'var(--text3)' }}>{pct}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/*  Best Pairings  */}
                  {(() => {
                    const topPairs = partnerships.filter(p => p.total >= 3)
                    if (topPairs.length === 0) return null
                    const visible = showAllPairs ? topPairs : topPairs.slice(0, 3)
                    const medals = ['1st','2nd','3rd']
                    return (
                      <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                        <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Best Pairings</div>
                          <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>Min. 3 matches together</div>
                        </div>
                        {visible.map((pair, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i < visible.length-1 ? '0.5px solid var(--border)' : 'none' }}>
                            <div style={{ fontSize:15, width:22, flexShrink:0, textAlign:'center' }}>
                              {i < 3 ? medals[i] : <span style={{ fontSize:12, color:'var(--text3)', fontWeight:600 }}>#{i+1}</span>}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {pair.names.map(n => shortName(n)).join(' + ')}
                              </div>
                              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{pair.total} matches together</div>
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color: pair.rate >= 50 ? 'var(--accent)' : '#ff5c5c' }}>{pair.rate}%</div>
                              <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{pair.wins}W / {pair.losses}L</div>
                            </div>
                          </div>
                        ))}
                        {topPairs.length > 3 && (
                          <button onClick={() => setShowAllPairs(v => !v)} style={{
                            width:'100%', padding:'8px 0', background:'none', border:'none',
                            borderTop:'0.5px solid var(--border)', color:'var(--accent)',
                            fontSize:13, cursor:'pointer',
                          }}>
                            {showAllPairs ? 'Show less' : `Show ${topPairs.length - 3} more`}
                          </button>
                        )}
                      </div>
                    )
                  })()}

                  {/*  All-Time Records  */}
                  {clubRecords && (
                    <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                      <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>All-Time Records</div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'var(--border)' }}>
                        {clubRecords.topPlayer && (
                          <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Wins Leader</div>
                            <div style={{ fontSize:15, fontWeight:800, color:'var(--accent)' }}>{clubRecords.topPlayer.wins}W</div>
                            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{shortName(clubRecords.topPlayer.name)}</div>
                          </div>
                        )}
                        {clubRecords.topStreak && (
                          <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Hot Streak</div>
                            <div style={{ fontSize:15, fontWeight:800, color:'var(--accent)' }}>{clubRecords.topStreak.streak} wins</div>
                            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{shortName(clubRecords.topStreak.name)}</div>
                          </div>
                        )}
                        {clubRecords.biggestMargin > 0 && (
                          <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Biggest Win</div>
                            <div style={{ fontSize:15, fontWeight:800, color:'var(--accent)', fontFamily:'monospace' }}>{clubRecords.biggestMarginScore}</div>
                            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                              {(() => {
                                let best = null, bestM = 0
                                confirmedMatches.forEach(m => {
                                  const mg = Math.abs(m.team1_score - m.team2_score)
                                  if (mg > bestM) { bestM = mg; best = getTeam(m, m.winner_side).map(p => shortName(p.profiles?.full_name)).join(' / ') }
                                })
                                return best || '-'
                              })()}
                            </div>
                          </div>
                        )}
                        {clubRecords.busiestDay && (
                          <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Most Active</div>
                            <div style={{ fontSize:15, fontWeight:800, color:'var(--accent)' }}>{clubRecords.busiestDay[1]} matches</div>
                            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{clubRecords.busiestDay[0]}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/*  Recent Matches  */}
                  {confirmedMatches.length > 0 && (
                    <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                      <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Recent Matches</div>
                      </div>
                      {confirmedMatches.slice(0, 8).map(match => {
                        const t1Won = match.winner_side === 'team1'
                        const winnerNames = getTeam(match, t1Won ? 'team1' : 'team2').map(p => shortName(p.profiles?.full_name)).join(' / ')
                        const loserNames  = getTeam(match, t1Won ? 'team2' : 'team1').map(p => shortName(p.profiles?.full_name)).join(' / ')
                        const winScore  = t1Won ? match.team1_score : match.team2_score
                        const loseScore = t1Won ? match.team2_score : match.team1_score
                        const isMyMatch = match.match_players?.some(p => p.user_id === selectedPlayer)
                        return (
                          <div key={match.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderBottom:'0.5px solid var(--border)', background: isMyMatch ? 'var(--accent-dim)' : 'none' }}>
                            <div style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{winnerNames}</div>
                            <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:700, flexShrink:0 }}>
                              <span style={{ color:'var(--accent)' }}>{winScore}</span>
                              <span style={{ color:'var(--text3)', margin:'0 3px' }}>-</span>
                              <span style={{ color:'#ff5c5c' }}>{loseScore}</span>
                            </div>
                            <div style={{ flex:1, fontSize:13, color:'var(--text2)', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{loserNames}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}

            {/*  LAST SESSION  */}
            {statsMode === 'lastsession' && (() => {
              if (sessions.length === 0) return (
                <div className="empty">
                  <div className="empty-icon"></div>
                  <p>No sessions yet.</p>
                </div>
              )

              const sess = selectedSession || sessions[0]
              const sessionMatches = matches.filter(m => m.session_id === sess.id)
              const sessionConfirmed = sessionMatches.filter(m => m.status === 'confirmed' || m.status === 'pending')

              // Session leaderboard
              const sessStats = {}
              sessionConfirmed.forEach(match => {
                const t1 = match.match_players?.filter(p => p.side === 'team1').map(p => p.user_id) || []
                const t2 = match.match_players?.filter(p => p.side === 'team2').map(p => p.user_id) || []
                const t1Won = match.winner_side === 'team1'
                ;[...t1.map(id => ({ id, side:'team1' })), ...t2.map(id => ({ id, side:'team2' }))].forEach(({ id, side }) => {
                  if (!sessStats[id]) {
                    const mem = members.find(m => m.id === id)
                    sessStats[id] = { id, name: mem?.full_name || '?', wins:0, losses:0, pointsFor:0, pointsAgainst:0 }
                  }
                  const won = side === 'team1' ? t1Won : !t1Won
                  const pf = side === 'team1' ? match.team1_score : match.team2_score
                  const pa = side === 'team1' ? match.team2_score : match.team1_score
                  if (won) sessStats[id].wins++; else sessStats[id].losses++
                  sessStats[id].pointsFor += pf
                  sessStats[id].pointsAgainst += pa
                })
              })
              const sessLb = Object.values(sessStats).sort((a, b) =>
                b.wins !== a.wins ? b.wins - a.wins : (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
              )

              // Session pairings (min 2 matches together)
              const sessPairsMap = {}
              sessionConfirmed.filter(m => getMatchType(m) === 'doubles').forEach(match => {
                ['team1','team2'].forEach(side => {
                  const sideTeam = getTeam(match, side)
                  if (sideTeam.length !== 2) return
                  const key = sideTeam.map(p => p.user_id).sort().join('|')
                  if (!sessPairsMap[key]) sessPairsMap[key] = { names: sideTeam.map(p => p.profiles?.full_name), wins:0, losses:0 }
                  if (match.winner_side === side) sessPairsMap[key].wins++; else sessPairsMap[key].losses++
                })
              })
              const sessPairList = Object.values(sessPairsMap)
                .map(p => ({ ...p, total: p.wins+p.losses, rate: Math.round(p.wins/(p.wins+p.losses)*100) }))
                .filter(p => p.total >= 2)
                .sort((a, b) => b.rate - a.rate || b.wins - a.wins)

              // Session insights
              const mvp = sessLb[0] || null
              const bestDuo = sessPairList[0] || null
              let closestMatch = null, biggestWinMatch = null
              sessionConfirmed.forEach(m => {
                const margin = Math.abs(m.team1_score - m.team2_score)
                if (!closestMatch || margin < Math.abs(closestMatch.team1_score - closestMatch.team2_score)) closestMatch = m
                if (!biggestWinMatch || margin > Math.abs(biggestWinMatch.team1_score - biggestWinMatch.team2_score)) biggestWinMatch = m
              })

              const duration = sess.ended_at
                ? (() => {
                    const mins = Math.round((new Date(sess.ended_at) - new Date(sess.started_at)) / 60000)
                    return mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`
                  })()
                : null

              const uniquePlayers = new Set()
              sessionConfirmed.forEach(m => m.match_players?.forEach(p => uniquePlayers.add(p.user_id)))
              const totalPts = sessionConfirmed.reduce((acc, m) => acc + m.team1_score + m.team2_score, 0)
              const medals = ['1st','2nd','3rd']

              return (
                <>
                  {/* Session selector */}
                  {sessions.length > 1 && (
                    <div style={{ position:'relative', marginBottom:10 }}>
                      <select value={sess.id} onChange={e => setSelectedSession(sessions.find(s => s.id === e.target.value))}
                        style={{
                          width:'100%', padding:'9px 36px 9px 12px',
                          background:'var(--bg2)', border:'0.5px solid var(--border2)',
                          borderRadius:'var(--radius-sm)', color:'var(--text)',
                          fontSize:13, fontFamily:'Inter,sans-serif', cursor:'pointer',
                          outline:'none', appearance:'none', WebkitAppearance:'none',
                        }}>
                        {sessions.map(s => (
                          <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' LIVE' : ''}</option>
                        ))}
                      </select>
                      <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none', fontSize:12 }}>v</span>
                    </div>
                  )}

                  {/* Session Summary card */}
                  <div style={{ background:'var(--bg2)', border:`0.5px solid ${sess.status === 'active' ? 'var(--accent)' : 'var(--border)'}`, borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                    <div style={{ padding:'14px 16px', borderBottom:'0.5px solid var(--border)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', flex:1 }}>{sess.name}</div>
                        {sess.status === 'active' && <span style={{ fontSize:11, color:'var(--accent)', fontWeight:700 }}>LIVE</span>}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text3)' }}>
                        {formatDate(sess.started_at)}{duration ? ` / ${duration}` : ''}
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'var(--border)' }}>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', textAlign:'center' }}>
                        <div style={{ fontSize:18, fontWeight:800, color:'var(--accent)' }}>{sessionConfirmed.length}</div>
                        <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>matches</div>
                      </div>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', textAlign:'center' }}>
                        <div style={{ fontSize:18, fontWeight:800, color:'var(--accent)' }}>{uniquePlayers.size}</div>
                        <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>players</div>
                      </div>
                      <div style={{ padding:'10px 12px', background:'var(--bg2)', textAlign:'center' }}>
                        <div style={{ fontSize:18, fontWeight:800, color:'var(--accent)' }}>{totalPts}</div>
                        <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>total pts</div>
                      </div>
                    </div>
                    <div style={{ padding:'10px 16px', borderTop:'0.5px solid var(--border)' }}>
                      <button className="btn btn-ghost btn-sm" style={{ width:'100%', fontSize:12 }}
                        onClick={() => navigate(`/club/${clubId}/session/${sess.id}`)}>
                        View Full Summary
                      </button>
                    </div>
                    {isModerator && (
                      <div style={{ padding:'0 16px 12px', display:'flex', gap:6 }}>
                        {editingSessionId === sess.id ? (
                          <>
                            <input className="input" value={editingSessionName}
                              onChange={e => setEditingSessionName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && renameSession(sess.id, editingSessionName)}
                              style={{ flex:1, padding:'6px 10px', fontSize:13 }} autoFocus />
                            <button className="btn btn-primary btn-sm" onClick={() => renameSession(sess.id, editingSessionName)}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingSessionId(null)}></button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost btn-sm" style={{ flex:1, fontSize:12 }}
                              onClick={() => { setEditingSessionId(sess.id); setEditingSessionName(sess.name) }}>Rename</button>
                            {sess.status === 'active' && (
                              <button className="btn btn-danger btn-sm" style={{ flex:1, fontSize:12 }}
                                onClick={() => endSession(sess.id)}>End Session</button>
                            )}
                            {sess.status === 'ended' && (
                              <button className="btn btn-secondary btn-sm" style={{ flex:1, fontSize:12 }}
                                onClick={() => reopenSession(sess.id)}> Reopen</button>
                            )}
                            {sessionMatches.length === 0 && sess.status !== 'active' && (
                              <button className="btn btn-danger btn-sm" style={{ flex:1, fontSize:12 }}
                                onClick={() => deleteSession(sess.id)}>Delete</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {sessionConfirmed.length === 0 && (
                    <div className="empty"><p>No confirmed matches in this session yet.</p></div>
                  )}

                  {sessionConfirmed.length > 0 && (
                    <>
                      {/* Session Insights */}
                      <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                        <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Session Insights</div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'var(--border)' }}>
                          {mvp && (
                            <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                              <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>MVP</div>
                              <div style={{ fontSize:14, fontWeight:800, color:'var(--accent)' }}>{shortName(mvp.name)}</div>
                              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{mvp.wins}W / {mvp.losses}L</div>
                            </div>
                          )}
                          {bestDuo ? (
                            <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                              <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Best Duo</div>
                              <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {bestDuo.names.map(n => shortName(n)).join(' + ')}
                              </div>
                              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{bestDuo.wins}W / {bestDuo.total} matches</div>
                            </div>
                          ) : (
                            <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                              <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Best Duo</div>
                              <div style={{ fontSize:12, color:'var(--text3)' }}>No doubles pairs yet</div>
                            </div>
                          )}
                          {closestMatch && closestMatch.id !== biggestWinMatch?.id && (
                            <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                              <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Closest Match</div>
                              <div style={{ fontSize:14, fontWeight:800, color:'var(--accent)', fontFamily:'monospace' }}>
                                {Math.max(closestMatch.team1_score, closestMatch.team2_score)} - {Math.min(closestMatch.team1_score, closestMatch.team2_score)}
                              </div>
                              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {getTeam(closestMatch, closestMatch.winner_side).map(p => shortName(p.profiles?.full_name)).join(' / ')} won
                              </div>
                            </div>
                          )}
                          {biggestWinMatch && (
                            <div style={{ padding:'12px 14px', background:'var(--bg2)' }}>
                              <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Biggest Win</div>
                              <div style={{ fontSize:14, fontWeight:800, color:'var(--accent)', fontFamily:'monospace' }}>
                                {Math.max(biggestWinMatch.team1_score, biggestWinMatch.team2_score)} - {Math.min(biggestWinMatch.team1_score, biggestWinMatch.team2_score)}
                              </div>
                              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {getTeam(biggestWinMatch, biggestWinMatch.winner_side).map(p => shortName(p.profiles?.full_name)).join(' / ')}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Session Leaderboard */}
                      <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                        <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Session Leaderboard</div>
                        </div>
                        {sessLb.map((p, i) => {
                          const isMe = p.id === user.id
                          const total = p.wins + p.losses
                          const pct = total > 0 ? Math.round(p.wins / total * 100) : 0
                          return (
                            <div key={p.id} style={{
                              display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                              background: isMe ? 'var(--accent-dim)' : 'none',
                              borderBottom:'0.5px solid var(--border)',
                            }}>
                              <div style={{ width:22, textAlign:'center', flexShrink:0, fontSize: i < 3 ? 15 : 12, color: i >= 3 ? 'var(--text3)' : 'inherit', fontWeight: i >= 3 ? 600 : 'inherit' }}>
                                {i < 3 ? medals[i] : `#${i+1}`}
                              </div>
                              <div style={{ flex:1, fontSize:13, fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--accent)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {properCase(p.name)}
                              </div>
                              <div style={{ fontSize:12, color:'var(--text2)', whiteSpace:'nowrap', flexShrink:0 }}>
                                {p.wins}W / {p.losses}L
                              </div>
                              <div style={{ width:38, textAlign:'right', flexShrink:0 }}>
                                <span style={{ fontSize:13, fontWeight:700, color: pct >= 50 ? 'var(--accent)' : '#ff5c5c' }}>{pct}%</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Session Best Pairings */}
                      {sessPairList.length > 0 && (
                        <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                          <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Best Pairings</div>
                            <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>This session only</div>
                          </div>
                          {sessPairList.map((pair, i) => (
                            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i < sessPairList.length-1 ? '0.5px solid var(--border)' : 'none' }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {pair.names.map(n => shortName(n)).join(' + ')}
                                </div>
                                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{pair.total} matches together</div>
                              </div>
                              <div style={{ textAlign:'right', flexShrink:0 }}>
                                <div style={{ fontSize:13, fontWeight:700, color: pair.rate >= 50 ? 'var(--accent)' : '#ff5c5c' }}>{pair.rate}%</div>
                                <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{pair.wins}W / {pair.losses}L</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Session Matches */}
                      <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
                        <div style={{ padding:'12px 14px 8px', borderBottom:'0.5px solid var(--border)' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Matches</div>
                        </div>
                        {sessionMatches.map(match => {
                          const t1Won = match.winner_side === 'team1'
                          const winnerNames = getTeam(match, t1Won ? 'team1' : 'team2').map(p => shortName(p.profiles?.full_name)).join(' / ')
                          const loserNames  = getTeam(match, t1Won ? 'team2' : 'team1').map(p => shortName(p.profiles?.full_name)).join(' / ')
                          const winScore  = t1Won ? match.team1_score : match.team2_score
                          const loseScore = t1Won ? match.team2_score : match.team1_score
                          const badge = getStatusBadge(match.status)
                          const isMyMatch = match.match_players?.some(p => p.user_id === user.id)
                          return (
                            <div key={match.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderBottom:'0.5px solid var(--border)', background: isMyMatch ? 'var(--accent-dim)' : 'none' }}>
                              <div style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{winnerNames}</div>
                              <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:700, flexShrink:0 }}>
                                <span style={{ color:'var(--accent)' }}>{winScore}</span>
                                <span style={{ color:'var(--text3)', margin:'0 3px' }}>-</span>
                                <span style={{ color:'#ff5c5c' }}>{loseScore}</span>
                              </div>
                              <div style={{ flex:1, fontSize:13, color:'var(--text2)', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{loserNames}</div>
                              {badge && <span style={{ fontSize:10, color:badge.color, flexShrink:0 }}>{badge.label}</span>}
                              {isModerator && (
                                <button onClick={() => deleteMatch(match.id)}
                                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14, padding:'0 2px', flexShrink:0 }}>x</button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              )
            })()}
          </>
        )}


      </div>

      <GroupNav clubId={clubId} isMod={isModerator} activeTab="stats" />

      <Toast message={toast} />
      {confirmModal}
    </div>
  )
}
