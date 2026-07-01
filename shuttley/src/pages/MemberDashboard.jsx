import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { generateSchedule } from '../utils/scheduleGenerator'
import { usePushNotifications } from '../hooks/usePushNotifications'
import GroupNav from '../components/GroupNav'
import GroupWorldHeader from '../components/GroupWorldHeader'
import Toast from '../components/Toast'
import { useConfirm } from '../hooks/useConfirm'
import { DashboardSkeleton } from '../components/Skeleton'

export default function MemberDashboard() {
  const { clubId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [club, setClub] = useState(null)
  const [members, setMembers] = useState([])
  const [pendingMatches, setPendingMatches] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [confirmDialog, confirmModal] = useConfirm()
  const [tab, setTab] = useState(searchParams.get('tab') || 'session')
  const [sessions, setSessions] = useState([])
  const [membersExpanded, setMembersExpanded] = useState(true)
  const [guestsExpanded, setGuestsExpanded] = useState(false)
  const [showStartModal, setShowStartModal] = useState(false)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([])
  const [modalMatchType, setModalMatchType] = useState('doubles')
  const [sessionMode, setSessionMode] = useState('free')
  const [modalStep, setModalStep] = useState(1)
  const [matchCount, setMatchCount] = useState(0)
  const [tileData, setTileData] = useState({})
  const [tileIndices, setTileIndices] = useState({ history:0, leaders:0, stats:0, polls:0, splits:0 })
  const [tileOpacity, setTileOpacity] = useState({ history:1, leaders:1, stats:1, polls:1, splits:1 })
  const tileTimers   = useRef({})
  const tileTransMs  = useRef({ history:2000, leaders:2000, stats:2000, polls:2000, splits:2000 })
  // Capture before window.history.replaceState clears location state
  const openPollIdRef = useRef(location.state?.openPollId)
  const [activePolls, setActivePolls] = useState([])
  const [myPollResponses, setMyPollResponses] = useState({})
  const [expandedPolls, setExpandedPolls] = useState({})
  const [showPollModal, setShowPollModal] = useState(false)
  const [pollDate, setPollDate] = useState('')
  const [pollStartH, setPollStartH] = useState('')
  const [pollStartM, setPollStartM] = useState('00')
  const [pollStartAP, setPollStartAP] = useState('PM')
  const [pollEndH, setPollEndH] = useState('')
  const [pollEndM, setPollEndM] = useState('00')
  const [pollEndAP, setPollEndAP] = useState('PM')
  const [pollNotes, setPollNotes] = useState('')
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [showCustomPollModal, setShowCustomPollModal] = useState(false)
  const [customPollQ, setCustomPollQ] = useState('')
  const [customPollNotes, setCustomPollNotes] = useState('')
  const [customPollOptions, setCustomPollOptions] = useState(['', ''])
  const [creatingCustomPoll, setCreatingCustomPoll] = useState(false)
  const { sendPush, subscribe } = usePushNotifications()
  const [notifStatus, setNotifStatus] = useState(() =>
    Notification.permission === 'granted' || localStorage.getItem('push_subscribed') === '1'
      ? 'granted' : Notification.permission
  )
  const [showNotifModal, setShowNotifModal] = useState(false)
  const [clubFeatures, setClubFeatures] = useState([])
  const [splitsItems, setSplitsItems] = useState([{ line1: 'Track expenses', line2: 'Split & settle up' }])

  function changeTab(t) {
    setTab(t)
    setSearchParams({ tab: t }, { replace: true })
  }

  useEffect(() => {
    const t = location.state?.tab || searchParams.get('tab') || 'session'
    setTab(t)
    setSearchParams({ tab: t }, { replace: true })
    window.history.replaceState({}, '')
    fetchData()
  }, [clubId, user])

  // Sync tab when GroupNav changes ?tab= param on the same route
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setTab(t)
  }, [searchParams])

  // Handle navigation from Home: expand a specific poll
  useEffect(() => {
    if (activePolls.length === 0) return
    if (openPollIdRef.current) {
      const pollId = openPollIdRef.current
      openPollIdRef.current = null // fire once
      setExpandedPolls(prev => ({ ...prev, [pollId]: true }))
      setTab('polls')
      setSearchParams({ tab: 'polls' }, { replace: true })
      setTimeout(() => {
        document.querySelector(`[data-poll-id="${pollId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [activePolls.length])

  useEffect(() => {
    if (loading) return  // eslint-disable-line
    const schedule = (key, count) => {
      const visibleMs = 3000 + Math.random() * 2000   // 3–5s visible
      const fadeOutMs = 2000 + Math.random() * 2000   // 2–4s fade out
      const fadeInMs  = 1500 + Math.random() * 1000   // 1.5–2.5s fade in
      tileTimers.current[key] = setTimeout(() => {
        // Fade out
        tileTransMs.current[key] = fadeOutMs
        setTileOpacity(prev => ({ ...prev, [key]: 0 }))
        setTimeout(() => {
          // Swap content while invisible, then fade in
          setTileIndices(prev => ({ ...prev, [key]: (prev[key] + 1) % count }))
          tileTransMs.current[key] = fadeInMs
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setTileOpacity(prev => ({ ...prev, [key]: 1 }))
          }))
          schedule(key, count)
        }, fadeOutMs + 50)
      }, visibleMs)
    }
    ;['history','leaders','stats'].forEach(k => schedule(k, 4))
    return () => Object.values(tileTimers.current).forEach(clearTimeout)
  }, [loading])

  useEffect(() => {
    if (loading || activePolls.length <= 1) return
    const schedule = () => {
      const visibleMs = 3000 + Math.random() * 2000
      const fadeOutMs = 2000 + Math.random() * 2000
      const fadeInMs  = 1500 + Math.random() * 1000
      tileTimers.current['polls'] = setTimeout(() => {
        tileTransMs.current['polls'] = fadeOutMs
        setTileOpacity(prev => ({ ...prev, polls: 0 }))
        setTimeout(() => {
          setTileIndices(prev => ({ ...prev, polls: (prev.polls + 1) % activePolls.length }))
          tileTransMs.current['polls'] = fadeInMs
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setTileOpacity(prev => ({ ...prev, polls: 1 }))
          }))
          schedule()
        }, fadeOutMs + 50)
      }, visibleMs)
    }
    schedule()
    return () => clearTimeout(tileTimers.current['polls'])
  }, [loading, activePolls.length])

  useEffect(() => {
    if (loading || splitsItems.length <= 1) return
    const schedule = () => {
      const visibleMs = 3000 + Math.random() * 2000
      const fadeOutMs = 2000 + Math.random() * 2000
      const fadeInMs  = 1500 + Math.random() * 1000
      tileTimers.current['splits'] = setTimeout(() => {
        tileTransMs.current['splits'] = fadeOutMs
        setTileOpacity(prev => ({ ...prev, splits: 0 }))
        setTimeout(() => {
          setTileIndices(prev => ({ ...prev, splits: (prev.splits + 1) % splitsItems.length }))
          tileTransMs.current['splits'] = fadeInMs
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setTileOpacity(prev => ({ ...prev, splits: 1 }))
          }))
          schedule()
        }, fadeOutMs + 50)
      }, visibleMs)
    }
    schedule()
    return () => clearTimeout(tileTimers.current['splits'])
  }, [loading, splitsItems.length])

  async function fetchData() {
    try {
    setClubFeatures([])
    const [{ data: clubData }, { data: mem }] = await Promise.all([
      supabase.from('clubs').select('*').eq('id', clubId).single(),
      supabase.from('memberships').select('*').eq('club_id', clubId).eq('user_id', user.id).single(),
    ])
    setClub(clubData)
    setMembership(mem)

    if (mem?.role === 'moderator' && mem?.status === 'approved') {
      navigate(`/club/${clubId}/mod`, { replace: true })
      return
    }

    const today = new Date().toISOString().split('T')[0]

    // Independent reads — fetched in parallel instead of one-by-one.
    const [
      { data: mems },
      { data: matchData },
      { data: session },
      { data: winMatches },
      { count: sCount },
      { data: sessDetail },
      { data: pollData },
      { data: featuresData },
    ] = await Promise.all([
      supabase.from('memberships').select('*, profiles(*)').eq('club_id', clubId).order('joined_at', { ascending: false }),
      mem?.status === 'approved'
        ? supabase.from('matches').select('*, match_players(user_id, side, profiles(full_name))').eq('club_id', clubId).eq('status', 'pending')
        : Promise.resolve({ data: null }),
      supabase.from('sessions').select('*').eq('club_id', clubId).eq('status', 'active').maybeSingle(),
      supabase.from('matches').select('winner_side, team1_score, team2_score, played_at, match_players(user_id, side, profiles(full_name))').eq('club_id', clubId).eq('status', 'confirmed'),
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('club_id', clubId),
      supabase.from('sessions').select('id, name, status, started_at, ended_at, rotation_player_ids').eq('club_id', clubId).order('started_at', { ascending: false }),
      supabase.from('session_polls').select('*, poll_responses(*)').eq('club_id', clubId).eq('status', 'open').or(`session_date.gte.${today},session_date.is.null`).order('session_date', { ascending: true, nullsFirst: false }),
      supabase.from('club_features').select('*').eq('club_id', clubId),
    ])

    setMembers(mems || [])

    if (mem?.status === 'approved') {
      const toConfirm = (matchData || []).filter(match => {
        const isPlayer = match.match_players?.some(p => p.user_id === user.id)
        const isRecorder = match.recorded_by === user.id
        return isPlayer && !isRecorder
      })
      setPendingMatches(toConfirm)
    }

    setActiveSession(session || null)
    setSessions((sessDetail || []).filter(s => s.status === 'ended'))

    const wm = winMatches || []
    setMatchCount(wm.length)

    // Last 4 weeks
    const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
    const recentWm = wm.filter(m => new Date(m.played_at) >= fourWeeksAgo)

    const ps = {}
    wm.forEach(m => {
      m.match_players?.forEach(p => {
        if (!ps[p.user_id]) ps[p.user_id] = { name: p.profiles?.full_name, wins: 0, total: 0 }
        ps[p.user_id].total++
        if (p.side === m.winner_side) ps[p.user_id].wins++
      })
    })
    const topPlayer = Object.values(ps).sort((a, b) => b.wins - a.wins)[0] || null
    const topRate = Object.values(ps).filter(p => p.total >= 3).map(p => ({ ...p, rate: Math.round(p.wins / p.total * 100) })).sort((a, b) => b.rate - a.rate)[0] || null
    const pairs = {}
    wm.forEach(m => {
      ;['team1','team2'].forEach(side => {
        const t = m.match_players?.filter(p => p.side === side) || []
        if (t.length !== 2) return
        const key = t.map(p => p.user_id).sort().join('|')
        if (!pairs[key]) pairs[key] = { names: t.map(p => p.profiles?.full_name), wins: 0, losses: 0 }
        if (m.winner_side === side) pairs[key].wins++; else pairs[key].losses++
      })
    })
    const topPair = Object.values(pairs).filter(p => p.wins + p.losses >= 2).sort((a, b) => b.wins - a.wins)[0] || null

    // Win streak per player
    const playerMatches = {}
    wm.forEach(m => {
      m.match_players?.forEach(p => {
        if (!playerMatches[p.user_id]) playerMatches[p.user_id] = []
        playerMatches[p.user_id].push({ won: p.side === m.winner_side, date: m.played_at })
      })
    })
    let topStreak = null
    Object.entries(playerMatches).forEach(([uid, matches]) => {
      const sorted = [...matches].sort((a,b) => new Date(b.date) - new Date(a.date))
      let streak = 0
      for (const m of sorted) { if (m.won) streak++; else break }
      if (streak >= 2 && (!topStreak || streak > topStreak.streak)) {
        const name = ps[uid]?.name?.split(' ')[0]
        if (name) topStreak = { name, streak }
      }
    })

    // Recent (4 wks) personal stats
    const recentMine = recentWm.filter(m => m.match_players?.some(p => p.user_id === user.id))
    const recentWins = recentMine.filter(m => m.match_players?.find(p => p.user_id === user.id)?.side === m.winner_side).length
    const recentLosses = recentMine.length - recentWins

    // Most played opponent (last 4 wks)
    const oppCount = {}
    recentWm.forEach(m => {
      const mySide = m.match_players?.find(p => p.user_id === user.id)?.side
      if (!mySide) return
      const oppSide = mySide === 'team1' ? 'team2' : 'team1'
      m.match_players?.filter(p => p.side === oppSide).forEach(p => {
        const name = p.profiles?.full_name?.split(' ')[0]
        if (name) oppCount[name] = (oppCount[name] || 0) + 1
      })
    })
    const mostPlayedOpp = Object.entries(oppCount).sort((a,b) => b[1]-a[1])[0] || null

    // Biggest win
    let biggestWin = null
    wm.forEach(m => {
      const mySide = m.match_players?.find(p => p.user_id === user.id)?.side
      if (!mySide || mySide !== m.winner_side) return
      const s1 = m.team1_score || 0, s2 = m.team2_score || 0
      const diff = Math.abs(s1 - s2)
      const score = mySide === 'team1' ? `${s1}–${s2}` : `${s2}–${s1}`
      if (!biggestWin || diff > biggestWin.diff) biggestWin = { diff, score }
    })

    // Personal stats
    const myPS = ps[user.id] || { wins: 0, total: 0 }
    const myWinRate = myPS.total > 0 ? Math.round(myPS.wins / myPS.total * 100) : null
    const ranked = Object.entries(ps).filter(([,p]) => p.total >= 10).sort((a,b) => {
      const aRate = a[1].total > 0 ? a[1].wins / a[1].total : 0
      const bRate = b[1].total > 0 ? b[1].wins / b[1].total : 0
      if (Math.abs(bRate - aRate) > 0.0001) return bRate - aRate
      return b[1].total - a[1].total
    })
    const myRankIdx = ranked.findIndex(([uid]) => uid === user.id)
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null
    const partnerCount = {}
    wm.forEach(m => {
      const mySide = m.match_players?.find(p => p.user_id === user.id)?.side
      if (!mySide) return
      m.match_players?.filter(p => p.side === mySide && p.user_id !== user.id).forEach(p => {
        const name = p.profiles?.full_name?.split(' ')[0]
        if (name) partnerCount[name] = (partnerCount[name] || 0) + 1
      })
    })
    const bestPartner = Object.entries(partnerCount).sort((a,b) => b[1]-a[1])[0]?.[0] || null

    // Sessions detail
    const sd = sessDetail || []
    const lastSessionDate = sd[0] ? new Date(sd[0].started_at).toLocaleDateString('en-AU', { day:'numeric', month:'short' }) : null
    const moCount = {}
    sd.forEach(s => { const mo = new Date(s.started_at).toLocaleDateString('en-AU', { month:'long' }); moCount[mo] = (moCount[mo]||0)+1 })
    const mostActiveMonth = Object.entries(moCount).sort((a,b) => b[1]-a[1])[0]?.[0] || null
    const sessWithP = sd.filter(s => s.rotation_player_ids?.length > 0)
    const avgPlayers = sessWithP.length > 0 ? Math.round(sessWithP.reduce((sum,s) => sum + s.rotation_player_ids.length, 0) / sessWithP.length) : null

    // Group all matches by date for History tile
    const matchesByDate = {}
    wm.forEach(m => {
      const dk = m.played_at ? m.played_at.split('T')[0] : null
      if (!dk) return
      matchesByDate[dk] = (matchesByDate[dk] || 0) + 1
    })
    const recentDates = Object.entries(matchesByDate)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([dk, count]) => ({
        label: new Date(dk + 'T00:00:00').toLocaleDateString('en-AU', { day:'numeric', month:'short' }),
        count,
      }))

    setTileData({
      topPlayer, topPair, topRate, sessionCount: sCount || 0,
      topStreak, recentDates,
      recentMatchCount: recentWm.length, recentWins, recentLosses,
      mostPlayedOpp: mostPlayedOpp ? { name: mostPlayedOpp[0], count: mostPlayedOpp[1] } : null,
      biggestWin,
      myWinRate, myStats: myPS, myRank, bestPartner,
      lastSessionDate, mostActiveMonth, avgPlayers,
    })

    // Active polls — only today or future (auto-expire by session date)
    const pd = pollData || []
    setActivePolls(pd)
    const myRespMap = {}
    pd.forEach(p => {
      const mine = p.poll_responses?.find(r => r.user_id === user.id)
      if (mine) myRespMap[p.id] = mine.response
    })
    setMyPollResponses(myRespMap)

    setClubFeatures(featuresData || [])

    // Splits balance for live tile
    const splitsFeature = (featuresData || []).find(f => f.feature === 'splits')
    if (splitsFeature?.unlocked && splitsFeature?.enabled) {
      const { data: expData } = await supabase
        .from('splits_expenses')
        .select('*, splits_participants(*)')
        .eq('club_id', clubId)
      const exps = expData || []
      const rawDebts = {}
      exps.forEach(exp => {
        ;(exp.splits_participants || []).forEach(p => {
          if (p.user_id === exp.paid_by) return
          const key = `${p.user_id}|${exp.paid_by}`
          rawDebts[key] = (rawDebts[key] || 0) + p.share
        })
      })
      const seen = new Set()
      const netDebts = []
      Object.entries(rawDebts).forEach(([key, amount]) => {
        if (seen.has(key)) return
        const [from, to] = key.split('|')
        const revKey = `${to}|${from}`
        const revAmount = rawDebts[revKey] || 0
        seen.add(key); seen.add(revKey)
        const net = amount - revAmount
        if (net > 0.005) netDebts.push({ from, to, amount: Math.round(net * 100) / 100 })
        else if (net < -0.005) netDebts.push({ from: to, to: from, amount: Math.round(-net * 100) / 100 })
      })
      const nameMap = {}
      ;(mems || []).forEach(m => { nameMap[m.user_id] = m.profiles?.full_name?.split(' ')[0] || 'Someone' })
      const items = []
      netDebts.filter(d => d.from === user.id).forEach(d =>
        items.push({ line1: `You owe ${nameMap[d.to] || 'someone'}`, line2: `$${d.amount.toFixed(2)}` })
      )
      netDebts.filter(d => d.to === user.id).forEach(d =>
        items.push({ line1: `${nameMap[d.from] || 'Someone'} owes you`, line2: `$${d.amount.toFixed(2)}` })
      )
      setSplitsItems(items.length > 0 ? items : [{ line1: 'All settled! 🎉', line2: 'No outstanding splits' }])
    }

    setLoading(false)
    } catch (err) {
      console.error('MemberDashboard fetchData error:', err)
      setLoading(false)
    }

    // If permission already granted, silently ensure subscription exists in DB
    if (Notification.permission === 'granted') {
      subscribe(user.id)
      setNotifStatus('granted')
    }

    // Show notification prompt if flagged on login
    if (localStorage.getItem('promptNotifications') === '1') {
      localStorage.removeItem('promptNotifications')
      if (Notification.permission === 'default') setShowNotifModal(true)
    }
  }

  function getSessionName() {
    const now = new Date()
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]
    const day = now.getDate()
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]
    const year = String(now.getFullYear()).slice(-2)
    return `${weekday} ${day} ${month} ${year}`
  }

  async function startSession() {
    const { data: existing } = await supabase
      .from('sessions').select('id, name').eq('club_id', clubId).eq('status', 'active').maybeSingle()
    if (existing) {
      showToast(`"${existing.name}" is still active. End it before starting a new session.`)
      setShowStartModal(false); fetchData(); return
    }

    if (sessionMode === 'rotation') {
      const minPlayers = modalMatchType === 'doubles' ? 4 : 2
      if (selectedPlayerIds.length < minPlayers) {
        showToast(`Need at least ${minPlayers} players for ${modalMatchType}`); return
      }
    }

    const { data: sess, error } = await supabase.from('sessions').insert({
      club_id: clubId,
      name: getSessionName(),
      started_by: user.id,
      status: 'active',
      match_type: modalMatchType,
      rotation_player_ids: sessionMode === 'rotation' ? selectedPlayerIds : []
    }).select().single()
    if (error) { showToast('Error: ' + error.message); return }

    if (sessionMode === 'rotation') {
      const schedule = generateSchedule(selectedPlayerIds, modalMatchType)
      if (schedule.length > 0) {
        const { error: rmError } = await supabase.from('rotation_matches').insert(
          schedule.map((m, i) => ({ ...m, session_id: sess.id, club_id: clubId, seq: i + 1, status: 'pending' }))
        )
        if (rmError) {
          await supabase.from('sessions').delete().eq('id', sess.id)
          showToast('Could not generate schedule — session not started: ' + rmError.message)
          fetchData()
          return
        }
      }
    }

    setShowStartModal(false)
    navigate(`/club/${clubId}/session/${sess.id}/rotation`)
  }

  async function endSession() {
    if (!activeSession) return
    const sessionPending = pendingMatches.filter(m => m.session_id === activeSession.id)
    if (sessionPending.length > 0) {
      const word = sessionPending.length === 1 ? '1 match is' : `${sessionPending.length} matches are`
      if (!(await confirmDialog(`${word} still pending. End session anyway?`))) return
    }
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', activeSession.id)
    if (!error) navigate(`/club/${clubId}/session/${activeSession.id}`)
  }

  async function confirmMatch(matchId) {
    const { error } = await supabase.from('matches').update({ status: 'confirmed' }).eq('id', matchId)
    if (error) { showToast('Error confirming match'); return }
    showToast('✔ Match confirmed!')
    fetchData()
  }

  async function disputeMatch(matchId) {
    const { error } = await supabase.from('matches').update({ status: 'disputed' }).eq('id', matchId)
    if (error) { showToast('Error disputing match'); return }
    showToast('⚠ Match disputed — moderator will review')
    fetchData()
  }

  function getTeamNames(match, side) {
    return match.match_players?.filter(p => p.side === side).map(p => p.profiles?.full_name || '?').join(' + ')
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function formatPollDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
  }

  async function updatePollResponse(pollId, response) {
    await supabase.from('poll_responses').upsert(
      { poll_id: pollId, user_id: user.id, response },
      { onConflict: 'poll_id,user_id' }
    )
    fetchData()
  }

  async function deletePoll(pollId) {
    if (!(await confirmDialog('Are you sure you want to delete this poll? This cannot be undone.'))) return
    const { error } = await supabase.from('session_polls').delete().eq('id', pollId)
    if (error) { showToast('Error deleting poll'); return }
    showToast('Poll deleted')
    fetchData()
  }

  function buildHHMM(h, m, ap) {
    if (!h) return null
    let hr = parseInt(h)
    if (ap === 'PM' && hr !== 12) hr += 12
    if (ap === 'AM' && hr === 12) hr = 0
    return `${hr.toString().padStart(2,'0')}:${m}`
  }

  function fmtHHMM(hhmm) {
    if (!hhmm) return ''
    const [h, m] = hhmm.split(':').map(Number)
    const ap = h >= 12 ? 'PM' : 'AM'
    const hr = h % 12 || 12
    return `${hr}:${m.toString().padStart(2,'0')} ${ap}`
  }

  async function createPoll() {
    if (!pollDate) return
    setCreatingPoll(true)
    const s = buildHHMM(pollStartH, pollStartM, pollStartAP)
    const e = buildHHMM(pollEndH, pollEndM, pollEndAP)
    const timeStr = s ? (e ? `${fmtHHMM(s)} – ${fmtHHMM(e)}` : fmtHHMM(s)) : null
    const { data: poll, error } = await supabase.from('session_polls').insert({
      club_id: clubId, created_by: user.id,
      session_date: pollDate,
      session_time: timeStr,
      notes: pollNotes.trim() || null,
    }).select().single()
    if (error) { setCreatingPoll(false); showToast('Error creating poll'); return }

    const memberUserIds = members.filter(m => m.status === 'approved').map(m => m.user_id)
    if (memberUserIds.length > 0) {
      const dateLabel = new Date(pollDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
      await sendPush(
        memberUserIds,
        `${club?.name} — Coming ${dateLabel}?`,
        timeStr ? `Session at ${timeStr}` : 'Tap to respond',
        '/'
      )
    }

    setCreatingPoll(false)
    setShowPollModal(false)
    setPollDate(''); setPollStartH(''); setPollStartM('00'); setPollStartAP('PM')
    setPollEndH(''); setPollEndM('00'); setPollEndAP('PM'); setPollNotes('')
    fetchData()
  }

  async function createCustomPoll() {
    if (!customPollQ.trim()) return
    setCreatingCustomPoll(true)
    const filledOpts = customPollOptions.map(o => o.trim()).filter(Boolean)
    let notesContent
    if (filledOpts.length >= 2) {
      notesContent = JSON.stringify({
        q: customPollQ.trim(),
        opts: filledOpts,
        ...(customPollNotes.trim() ? { note: customPollNotes.trim() } : {}),
      })
    } else {
      notesContent = customPollQ.trim() + (customPollNotes.trim() ? '\n' + customPollNotes.trim() : '')
    }
    const { error } = await supabase.from('session_polls').insert({
      club_id: clubId, created_by: user.id,
      session_date: null,
      notes: notesContent,
    })
    if (!error) {
      const memberUserIds = members.filter(m => m.status === 'approved').map(m => m.user_id)
      if (memberUserIds.length > 0) {
        await sendPush(memberUserIds, `${club?.name} — Poll`, customPollQ.trim(), '/')
      }
    }
    setCreatingCustomPoll(false)
    setShowCustomPollModal(false)
    setCustomPollQ(''); setCustomPollNotes(''); setCustomPollOptions(['', ''])
    fetchData()
  }

  if (loading) return <DashboardSkeleton />

  const approved = members.filter(m => m.status === 'approved')

  const firstName = profile?.full_name?.split(' ')[0] || ''

  return (
    <div className="page">
      {/* Top nav */}
      <div className="topnav">
        <GroupWorldHeader clubId={clubId} groupName={club?.name} isMod={false} activeTab={tab} />
      </div>

      <div className="content">

        {/* ── SESSION ── */}
        {tab === 'session' && <>

          {membership?.status === 'pending' && (
            <div style={{ textAlign:'center', padding:'60px 0' }}>
              <div style={{ fontSize:48, marginBottom:20 }}>⏳</div>
              <h2 style={{ fontSize:24, marginBottom:10 }}>Pending approval</h2>
              <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.6 }}>
                Your request to join <strong>{club?.name}</strong> is waiting for the moderator to approve you.
              </p>
            </div>
          )}

          {membership?.status === 'rejected' && (
            <div style={{ textAlign:'center', padding:'60px 0' }}>
              <div style={{ fontSize:48, marginBottom:20 }}>❌</div>
              <h2 style={{ fontSize:24, marginBottom:10 }}>Request declined</h2>
              <p style={{ color:'var(--text2)', fontSize:14 }}>Your request to join was not approved.</p>
              <button className="btn btn-ghost" style={{ marginTop:24 }} onClick={() => navigate('/')}>Go back home</button>
            </div>
          )}

          {membership?.status === 'approved' && <>

            {/* Pending match confirmations */}
            {pendingMatches.length > 0 && (
              <div style={{
                background:'rgba(255,200,50,0.07)', border:'1px solid rgba(255,200,50,0.3)',
                borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16,
              }}>
                <div style={{ fontSize:11, color:'#ffc832', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                  ⏳ {pendingMatches.length} match{pendingMatches.length !== 1 ? 'es' : ''} awaiting your confirmation
                </div>
                {pendingMatches.slice(0, 1).map(match => {
                  const team1Won = match.winner_side === 'team1'
                  return (
                    <div key={match.id}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                        <div style={{ flex:1, fontSize:13, fontWeight: team1Won ? 600 : 400 }}>{getTeamNames(match, 'team1')}</div>
                        <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:700, color:'var(--text)' }}>{match.team1_score}–{match.team2_score}</div>
                        <div style={{ flex:1, textAlign:'right', fontSize:13, fontWeight: !team1Won ? 600 : 400 }}>{getTeamNames(match, 'team2')}</div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button className="btn btn-primary btn-sm" style={{ flex:1 }} onClick={() => confirmMatch(match.id)}>✔ Confirm</button>
                        <button className="btn btn-danger btn-sm" style={{ flex:1 }} onClick={() => disputeMatch(match.id)}>✕ Dispute</button>
                      </div>
                    </div>
                  )
                })}
                {pendingMatches.length > 1 && (
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:8, textAlign:'center' }}>
                    +{pendingMatches.length - 1} more pending
                  </div>
                )}
              </div>
            )}

            {/* ── Two equal action cards ── */}
            {(() => {
              const cardStyle = {
                background:'var(--bg2)', border:'0.5px solid var(--border)',
                borderLeft:'3px solid var(--accent)', borderRadius:'var(--radius)',
                padding:'14px 16px', marginBottom:10,
              }
              return (
                <>
                  {/* Polls card */}
                  <div style={cardStyle}>
                    <div style={{ fontSize:15, fontWeight:700, marginBottom:10 }}>Polls</div>
                    <div style={{ display:'flex', gap:8, marginBottom: activePolls.length > 0 ? 12 : 0 }}>
                      <button onClick={() => { setPollDate(''); setPollStartH(''); setPollStartM('00'); setPollStartAP('PM'); setPollEndH(''); setPollEndM('00'); setPollEndAP('PM'); setPollNotes(''); setShowPollModal(true) }} style={{
                        flex:1, padding:'9px 4px', background:'var(--accent)', border:'none',
                        borderRadius:'var(--radius-sm)', color:'#fff',
                        fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif",
                      }}>+ Session Poll</button>
                      <button onClick={() => { setCustomPollQ(''); setCustomPollNotes(''); setCustomPollOptions(['', '']); setShowCustomPollModal(true) }} style={{
                        flex:1, padding:'9px 4px', background:'transparent', border:'1.5px solid var(--accent)',
                        borderRadius:'var(--radius-sm)', color:'var(--accent)',
                        fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif",
                      }}>+ Custom Poll</button>
                    </div>
                    {activePolls.length > 0 && (
                      <div style={{ borderTop:'0.5px solid var(--border)', marginLeft:-16, marginRight:-16, paddingLeft:16, paddingRight:16 }}>
                        {activePolls.map((poll, idx) => {
                          const myResp = poll.poll_responses?.find(r => r.user_id === user.id)?.response
                          const isCustom = !poll.session_date
                          const label = isCustom ? 'Custom Poll' : `Coming ${formatPollDate(poll.session_date)}?`
                          const respColor = myResp === 'yes' ? '#2a8c55' : myResp === 'no' ? '#e05555' : myResp === 'maybe' ? '#a07800' : 'var(--text3)'
                          const respLabel = myResp ? myResp.charAt(0).toUpperCase() + myResp.slice(1) : 'Respond →'
                          return (
                            <div key={poll.id}
                              onClick={() => { setExpandedPolls(prev => ({ ...prev, [poll.id]: true })); changeTab('polls') }}
                              style={{ display:'flex', alignItems:'center', gap:10, paddingTop:10, paddingBottom:10, borderBottom: idx < activePolls.length - 1 ? '0.5px solid var(--border)' : 'none', cursor:'pointer' }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
                                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                                  {poll.poll_responses?.length || 0} response{poll.poll_responses?.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <span style={{ fontSize:12, fontWeight:700, color:respColor, flexShrink:0 }}>{respLabel}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Start Session / Session in Progress card */}
                  {activeSession ? (
                    <div style={{ ...cardStyle, marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>● Live</div>
                      <div style={{ fontSize:15, fontWeight:700, marginBottom:2 }}>{activeSession.name}</div>
                      <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>Session in progress</div>
                      <button
                        onClick={() => navigate(`/club/${clubId}/session/${activeSession.id}/rotation`)}
                        style={{ width:'100%', padding:'9px', background:'var(--accent)', border:'none', borderRadius:'var(--radius-sm)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                        Open Session →
                      </button>
                    </div>
                  ) : (
                    <div style={{ ...cardStyle, marginBottom:16 }}>
                      <div style={{ fontSize:15, fontWeight:700, marginBottom:2 }}>Start Session</div>
                      <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>Track live matches, scores and rotations</div>
                      <button
                        onClick={() => { setSelectedPlayerIds([]); setSessionMode('free'); setModalStep(1); setShowStartModal(true) }}
                        style={{ width:'100%', padding:'9px', background:'var(--accent)', border:'none', borderRadius:'var(--radius-sm)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                        ▶  Start
                      </button>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Past sessions */}
            {sessions.length > 0 && (
              <div>
                <div className="section-label">Past sessions</div>
                {sessions.slice(0, 8).map(s => (
                  <div key={s.id} onClick={() => navigate(`/club/${clubId}/session/${s.id}`)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 0', borderBottom:'0.5px solid var(--border)', cursor:'pointer' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name || 'Session'}</div>
                      <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                        {s.rotation_player_ids?.length > 0 ? `${s.rotation_player_ids.length} players` : '—'}
                      </div>
                    </div>
                    <div style={{ fontSize:12, color:'var(--text3)', flexShrink:0 }}>
                      {s.ended_at ? new Date(s.ended_at).toLocaleDateString('en-AU', { day:'numeric', month:'short' }) : '—'}
                    </div>
                    <span style={{ fontSize:16, color:'var(--text3)', flexShrink:0 }}>›</span>
                  </div>
                ))}
                {sessions.length > 8 && (
                  <div onClick={() => navigate(`/club/${clubId}/matches?tab=sessions`)}
                    style={{ fontSize:13, color:'var(--accent)', fontWeight:600, textAlign:'center', padding:'14px 0', cursor:'pointer' }}>
                    View all {sessions.length} sessions →
                  </div>
                )}
              </div>
            )}

            {sessions.length === 0 && !activeSession && (
              <div className="empty">
                <div className="empty-icon">🏸</div>
                <p>No past sessions yet.</p>
              </div>
            )}

          </>}
        </>}

        {/* ── HOME (legacy — tiles dashboard) ── */}
        {tab === 'home' && <>

          {membership?.status === 'pending' && (
            <div style={{ textAlign:'center', padding:'60px 0' }}>
              <div style={{ fontSize:48, marginBottom:20 }}>⏳</div>
              <h2 style={{ fontSize:24, marginBottom:10 }}>Pending approval</h2>
              <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.6 }}>
                Your request to join <strong>{club?.name}</strong> is waiting for the moderator to approve you.
              </p>
            </div>
          )}

          {membership?.status === 'rejected' && (
            <div style={{ textAlign:'center', padding:'60px 0' }}>
              <div style={{ fontSize:48, marginBottom:20 }}>❌</div>
              <h2 style={{ fontSize:24, marginBottom:10 }}>Request declined</h2>
              <p style={{ color:'var(--text2)', fontSize:14 }}>Your request to join was not approved.</p>
              <button className="btn btn-ghost" style={{ marginTop:24 }} onClick={() => navigate('/')}>Go back home</button>
            </div>
          )}

          {membership?.status === 'approved' && <>

            {/* Pending match confirmations */}
            {pendingMatches.length > 0 && (
              <div style={{
                background:'rgba(255,200,50,0.07)', border:'1px solid rgba(255,200,50,0.3)',
                borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16,
              }}>
                <div style={{ fontSize:11, color:'#ffc832', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                  ⏳ {pendingMatches.length} match{pendingMatches.length !== 1 ? 'es' : ''} awaiting your confirmation
                </div>
                {pendingMatches.slice(0, 1).map(match => {
                  const team1Won = match.winner_side === 'team1'
                  return (
                    <div key={match.id}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                        <div style={{ flex:1, fontSize:13, fontWeight: team1Won ? 600 : 400 }}>{getTeamNames(match, 'team1')}</div>
                        <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:700, color:'var(--text)' }}>{match.team1_score}–{match.team2_score}</div>
                        <div style={{ flex:1, textAlign:'right', fontSize:13, fontWeight: !team1Won ? 600 : 400 }}>{getTeamNames(match, 'team2')}</div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button className="btn btn-primary btn-sm" style={{ flex:1 }} onClick={() => confirmMatch(match.id)}>✔ Confirm</button>
                        <button className="btn btn-danger btn-sm" style={{ flex:1 }} onClick={() => disputeMatch(match.id)}>✕ Dispute</button>
                      </div>
                    </div>
                  )
                })}
                {pendingMatches.length > 1 && (
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:8, textAlign:'center' }}>
                    +{pendingMatches.length - 1} more pending
                  </div>
                )}
              </div>
            )}

            {/* Session hero card */}
            {activeSession ? (
              <div style={{
                background:'var(--accent)', borderRadius:'var(--radius)',
                padding:'20px', marginBottom:16, color:'#fff',
              }}>
                <div style={{ fontSize:11, fontWeight:700, opacity:0.7, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>● Session in Progress</div>
                <div style={{ fontSize:22, fontWeight:700, marginBottom:4, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{activeSession.name}</div>
                <div style={{ fontSize:13, opacity:0.75, marginBottom:16, lineHeight:1.4 }}>A session is currently running. Tap to continue.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    onClick={() => navigate(`/club/${clubId}/session/${activeSession.id}/rotation`)}
                    style={{ flex:1, background:'#fff', color:'var(--accent)', border:'none', borderRadius:'var(--radius-sm)', padding:'10px', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                    Open Current Session →
                  </button>
                  <button
                    onClick={endSession}
                    style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.35)', borderRadius:'var(--radius-sm)', padding:'10px 16px', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                    End
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                background:'var(--accent)', borderRadius:'var(--radius)',
                padding:'20px', marginBottom:16, color:'#fff',
              }}>
                <div style={{ fontSize:11, fontWeight:600, opacity:0.65, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>Ready to play?</div>
                <div style={{ fontSize:22, fontWeight:700, marginBottom:6, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Start a Session</div>
                <div style={{ fontSize:13, opacity:0.75, marginBottom:16, lineHeight:1.5 }}>Track live matches, scores and court rotations</div>
                <button
                  onClick={() => { setSelectedPlayerIds([]); setSessionMode('free'); setModalStep(1); setShowStartModal(true) }}
                  style={{ width:'100%', background:'#fff', color:'var(--accent)', border:'none', borderRadius:'var(--radius-sm)', padding:'11px', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  ▶  Start Session
                </button>
              </div>
            )}

            {/* Leaderboard tiles + Polls */}
            {(() => {
              const td = tileData
              const tileConfigs = [
                {
                  key: 'leaders', label: 'Leaders', dest: `/club/${clubId}/matches?tab=leaderboard`,
                  items: [
                    { info: td.topPlayer ? `${td.topPlayer.name?.split(' ')[0]} · ${td.topPlayer.wins}W` : 'No data yet', sub: 'MVP' },
                    { info: td.topPair ? `${td.topPair.names.map(n => n?.split(' ')[0]).join(' & ')}` : 'No data yet', sub: 'Best pair' },
                    { info: td.topStreak ? `${td.topStreak.name} · ${td.topStreak.streak} in a row` : 'No data yet', sub: 'Win streak' },
                    { info: td.topRate ? `${td.topRate.name?.split(' ')[0]} · ${td.topRate.rate}%` : 'No data yet', sub: 'Best win rate' },
                  ],
                },
                {
                  key: 'stats', label: 'Stats', dest: `/club/${clubId}/matches?tab=stats`,
                  items: [
                    { info: td.myWinRate != null ? `${td.myWinRate}% win rate` : 'No matches yet', sub: 'Your rate' },
                    { info: td.myStats?.total > 0 ? `${td.myStats.wins}W · ${td.myStats.total - td.myStats.wins}L` : 'No matches yet', sub: 'Your record' },
                    { info: td.bestPartner ? `With ${td.bestPartner}` : 'No data yet', sub: 'Best partner' },
                    { info: td.myRank ? `Ranked #${td.myRank}` : (td.myStats?.total > 0 ? 'Not ranked yet' : 'No data yet'), sub: `${approved.filter(m => !m.is_guest).length} players` },
                  ],
                },
                {
                  key: 'history', label: 'History', dest: `/club/${clubId}/matches?tab=history`,
                  items: td.recentDates?.length > 0
                    ? td.recentDates.map(d => ({ info: d.label, sub: `${d.count} match${d.count !== 1 ? 'es' : ''}` }))
                    : [{ info: matchCount > 0 ? `${matchCount} matches` : 'No matches yet', sub: 'All time' }],
                },
              ]
              const tileStyle = {
                borderRadius: 'var(--radius)', padding: '10px 16px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderLeft: '4px solid var(--accent)',
                minHeight: 54,
                animation: 'tileIn 0.4s ease both',
              }
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {tileConfigs.map((t, i) => {
                    const idx = tileIndices[t.key] % t.items.length
                    const item = t.items[idx]
                    return (
                      <div key={t.key} onClick={() => navigate(t.dest)}
                        style={{ ...tileStyle, animationDelay: `${i * 65}ms` }}>
                        <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text)', width:76, flexShrink:0 }}>
                          {t.label}
                        </div>
                        <div style={{ flex:1, opacity: tileOpacity[t.key], transition: `opacity ${tileTransMs.current[t.key]}ms ease`, textAlign:'center' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>{item.info}</div>
                          <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, minHeight:15 }}>{item.sub || ''}</div>
                        </div>
                        <span style={{ fontSize:16, color:'var(--text)', marginLeft:8, flexShrink:0 }}>›</span>
                      </div>
                    )
                  })}

                  {/* ── Polls tile ── */}
                  <div onClick={() => changeTab('polls')}
                    style={{ ...tileStyle, animationDelay:'280ms' }}>
                    <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text)', width:76, flexShrink:0 }}>
                      Polls
                    </div>
                    {activePolls.length === 0 ? (
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>Create a poll</div>
                        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, minHeight:15 }}>No active polls</div>
                      </div>
                    ) : (() => {
                      const poll = activePolls[tileIndices.polls % activePolls.length]
                      const yes   = poll.poll_responses?.filter(r => r.response === 'yes').length   || 0
                      const no    = poll.poll_responses?.filter(r => r.response === 'no').length    || 0
                      const maybe = poll.poll_responses?.filter(r => r.response === 'maybe').length || 0
                      const tally = [yes && `${yes} Yes`, no && `${no} No`, maybe && `${maybe} Maybe`].filter(Boolean).join(' · ')
                      return (
                        <div style={{ flex:1, opacity: tileOpacity.polls, transition: `opacity ${tileTransMs.current.polls}ms ease`, textAlign:'center' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>{poll.session_date ? formatPollDate(poll.session_date) : 'Custom poll'}</div>
                          <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, minHeight:15 }}>{tally}</div>
                        </div>
                      )
                    })()}
                    <span style={{ fontSize:16, color:'var(--text)', marginLeft:8, flexShrink:0 }}>›</span>
                  </div>

                  {/* ── Splits tile ── */}
                  {(() => { const f = clubFeatures.find(x => x.feature === 'splits'); return f?.unlocked && f?.enabled })() && (
                    <div onClick={() => navigate(`/club/${clubId}/splits`)}
                      style={{ ...tileStyle, animationDelay:'345ms' }}>
                      <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text)', width:76, flexShrink:0 }}>Splits</div>
                      {(() => {
                        const idx = tileIndices.splits % splitsItems.length
                        const item = splitsItems[idx]
                        return (
                          <div style={{ flex:1, opacity: tileOpacity.splits, transition: `opacity ${tileTransMs.current.splits}ms ease`, textAlign:'center' }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>{item.line1}</div>
                            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, minHeight:15 }}>{item.line2}</div>
                          </div>
                        )
                      })()}
                      <span style={{ fontSize:16, color:'var(--text)', marginLeft:8, flexShrink:0 }}>›</span>
                    </div>
                  )}

                  {/* ── Chat tile ── */}
                  {(() => { const f = clubFeatures.find(x => x.feature === 'chat'); return f?.unlocked && f?.enabled })() ? (
                    <div onClick={() => navigate(`/club/${clubId}/chat`)}
                      style={{ ...tileStyle, animationDelay:'410ms' }}>
                      <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text)', width:76, flexShrink:0 }}>Chat</div>
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>Group chat</div>
                        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, minHeight:15 }}>Message your group</div>
                      </div>
                      <span style={{ fontSize:16, color:'var(--text)', marginLeft:8, flexShrink:0 }}>›</span>
                    </div>
                  ) : null}

                  {/* ── Members tile ── */}
                  {(() => {
                    const regularCount = approved.filter(m => !m.is_guest).length
                    const guestCount   = approved.filter(m => m.is_guest).length
                    return (
                      <div onClick={() => changeTab('members')}
                        style={{ ...tileStyle, animationDelay:'475ms' }}>
                        <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text)', width:76, flexShrink:0 }}>Members</div>
                        <div style={{ flex:1, textAlign:'center' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>{regularCount} member{regularCount !== 1 ? 's' : ''}</div>
                          <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, minHeight:15 }}>{guestCount > 0 ? `+ ${guestCount} guest${guestCount !== 1 ? 's' : ''}` : 'No guests'}</div>
                        </div>
                        <span style={{ fontSize:16, color:'var(--text)', marginLeft:8, flexShrink:0 }}>›</span>
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

          </>}
        </>}

        {/* ── POLLS ── */}
        {tab === 'polls' && (
          <div>
            <button onClick={() => { setPollDate(''); setPollStartH(''); setPollStartM('00'); setPollStartAP('PM'); setPollEndH(''); setPollEndM('00'); setPollEndAP('PM'); setPollNotes(''); setShowPollModal(true) }} style={{
              width:'100%', marginBottom:16, padding:'11px',
              background:'transparent', border:'1.5px dashed var(--border2)',
              borderRadius:'var(--radius)', color:'var(--accent)',
              fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif",
            }}>
              + New Poll
            </button>
            {activePolls.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📊</div>
                <p>No active polls right now</p>
              </div>
            ) : activePolls.map(poll => {
              const responseMap = {}
              poll.poll_responses?.forEach(r => { responseMap[r.user_id] = r.response })
              const isCustom = !poll.session_date

              // Parse JSON custom poll notes
              let parsedCustom = null
              if (isCustom && poll.notes) {
                try {
                  const p = JSON.parse(poll.notes)
                  if (p.q) parsedCustom = { question: p.q, options: Array.isArray(p.opts) && p.opts.length >= 2 ? p.opts : null, note: p.note || null }
                } catch {}
                if (!parsedCustom) {
                  const parts = poll.notes.split('\n')
                  parsedCustom = { question: parts[0], options: null, note: parts.slice(1).join('\n') || null }
                }
              }

              const hasCustomOpts = !!parsedCustom?.options
              const dateLabel = isCustom ? null : formatPollDate(poll.session_date)
              const myResp = myPollResponses[poll.id]
              const regularMembers = approved.filter(m => !m.is_guest)
              const pendingCount = regularMembers.filter(m => !responseMap[m.user_id]).length
              const isExpanded = !!expandedPolls[poll.id]

              const yes   = poll.poll_responses?.filter(r => r.response === 'yes').length   || 0
              const no    = poll.poll_responses?.filter(r => r.response === 'no').length    || 0
              const maybe = poll.poll_responses?.filter(r => r.response === 'maybe').length || 0
              const optionCounts = hasCustomOpts
                ? Object.fromEntries(parsedCustom.options.map(opt => [
                    opt, poll.poll_responses?.filter(r => r.response === opt).length || 0
                  ]))
                : null

              return (
                <div key={poll.id} data-poll-id={poll.id} style={{
                  background:'var(--bg2)', border:'1px solid var(--border)',
                  borderLeft:`4px solid ${isCustom ? 'var(--accent)' : '#b04400'}`,
                  borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden',
                }}>
                  {/* ── Collapsed header ── */}
                  <div onClick={() => setExpandedPolls(prev => ({ ...prev, [poll.id]: !prev[poll.id] }))}
                    style={{ padding:'13px 14px', cursor:'pointer', display:'flex', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1 }}>
                      {isCustom ? (
                        <>
                          <div style={{ fontSize:14, fontWeight:700, marginBottom: parsedCustom?.note ? 2 : 7 }}>
                            {parsedCustom?.question || 'Custom Poll'}
                          </div>
                          {parsedCustom?.note && (
                            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:7 }}>{parsedCustom.note}</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize:14, fontWeight:700, marginBottom: poll.session_time ? 2 : 7 }}>
                            Coming {dateLabel}?
                          </div>
                          {poll.session_time && (
                            <div style={{ fontSize:12, color:'var(--text2)', marginBottom: poll.notes ? 2 : 7 }}>{poll.session_time}</div>
                          )}
                          {poll.notes && (
                            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:7 }}>{poll.notes}</div>
                          )}
                        </>
                      )}
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        {hasCustomOpts ? (
                          parsedCustom.options.map(opt => (
                            <span key={opt} style={{ padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(122,164,196,0.12)', color:'var(--accent)' }}>
                              {optionCounts[opt]} · {opt}
                            </span>
                          ))
                        ) : (
                          <>
                            <span style={{ padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(42,140,85,0.1)', color:'#2a8c55' }}>{yes} Yes</span>
                            <span style={{ padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(224,85,85,0.1)', color:'#e05555' }}>{no} No</span>
                            {maybe > 0 && <span style={{ padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,200,50,0.1)', color:'#a07800' }}>{maybe} Maybe</span>}
                          </>
                        )}
                        {pendingCount > 0 && <span style={{ padding:'2px 9px', borderRadius:99, fontSize:11, fontWeight:600, background:'var(--bg3)', color:'var(--text3)' }}>{pendingCount} Pending</span>}
                      </div>
                    </div>
                    <span style={{ fontSize:18, color:'var(--text3)', flexShrink:0, marginTop:2, display:'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition:'transform 0.18s ease' }}>›</span>
                  </div>

                  {/* ── Expanded body ── */}
                  {isExpanded && (
                    <div style={{ padding:'12px 14px 16px', borderTop:'0.5px solid var(--border)' }}>
                      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', fontWeight:700, letterSpacing:'0.07em' }}>
                        {myResp ? 'Update your response' : 'Your response'}
                      </div>

                      {hasCustomOpts ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
                          {parsedCustom.options.map(opt => (
                            <button key={opt} onClick={() => updatePollResponse(poll.id, opt)} style={{
                              padding:'9px 14px', borderRadius:'var(--radius-sm)', textAlign:'left',
                              fontSize:13, fontWeight: myResp === opt ? 700 : 500,
                              cursor:'pointer', fontFamily:"'Inter',sans-serif",
                              background: myResp === opt ? 'rgba(122,164,196,0.15)' : 'transparent',
                              color: myResp === opt ? 'var(--accent)' : 'var(--text2)',
                              border: `1.5px solid ${myResp === opt ? 'var(--accent)' : 'var(--border)'}`,
                              display:'flex', alignItems:'center', justifyContent:'space-between',
                            }}>
                              <span>{opt}</span>
                              {myResp === opt && <span style={{ fontSize:11 }}>✓</span>}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                          {[
                            { key:'yes',   label:'Yes',   color:'#2a8c55', bg:'rgba(42,140,85,0.1)',  border:'rgba(42,140,85,0.3)'  },
                            { key:'no',    label:'No',    color:'#e05555', bg:'rgba(224,85,85,0.1)',  border:'rgba(224,85,85,0.3)'  },
                            { key:'maybe', label:'Maybe', color:'#a07800', bg:'rgba(255,200,50,0.1)', border:'rgba(220,175,20,0.3)' },
                          ].map(opt => (
                            <button key={opt.key} onClick={() => updatePollResponse(poll.id, opt.key)} style={{
                              flex:1, padding:'9px 4px', borderRadius:'var(--radius-sm)',
                              fontSize:13, fontWeight: myResp === opt.key ? 700 : 500,
                              cursor:'pointer', fontFamily:"'Inter',sans-serif",
                              background: myResp === opt.key ? opt.bg : 'transparent',
                              color: myResp === opt.key ? opt.color : 'var(--text2)',
                              border: `1.5px solid ${myResp === opt.key ? opt.border : 'var(--border)'}`,
                            }}>{opt.label}</button>
                          ))}
                        </div>
                      )}

                      {/* Grouped responses */}
                      {hasCustomOpts ? (
                        [...parsedCustom.options, null].map(opt => {
                          const groupMembers = regularMembers.filter(m =>
                            opt ? responseMap[m.user_id] === opt : !responseMap[m.user_id]
                          )
                          if (groupMembers.length === 0) return null
                          return (
                            <div key={opt || 'none'} style={{ marginBottom:12 }}>
                              <div style={{
                                display:'inline-flex', alignItems:'center',
                                padding:'2px 10px', borderRadius:99, marginBottom:6,
                                background: opt ? 'rgba(122,164,196,0.12)' : 'var(--bg3)',
                                color: opt ? 'var(--accent)' : 'var(--text3)',
                                fontSize:11, fontWeight:700,
                              }}>
                                {opt || "Didn't respond"} · {groupMembers.length}
                              </div>
                              {groupMembers.map(m => (
                                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 4px', borderBottom:'0.5px solid var(--border)' }}>
                                  <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, background:'var(--bg3)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--accent)' }}>
                                    {m.profiles?.avatar_url
                                      ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                      : (m.profiles?.full_name||'?')[0]}
                                  </div>
                                  <div style={{ flex:1, fontSize:13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    {m.profiles?.full_name}
                                    {m.user_id === user.id && <span style={{ fontSize:11, color:'var(--accent)', marginLeft:4 }}>· you</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })
                      ) : (
                        [
                          { key:'yes',   label:'Yes',            color:'#2a8c55', bg:'rgba(42,140,85,0.1)'  },
                          { key:'no',    label:'No',             color:'#e05555', bg:'rgba(224,85,85,0.1)'  },
                          { key:'maybe', label:'Maybe',          color:'#a07800', bg:'rgba(255,200,50,0.1)' },
                          { key:null,    label:"Didn't respond", color:'var(--text3)', bg:'var(--bg3)'       },
                        ].map(group => {
                          const groupMembers = regularMembers.filter(m =>
                            group.key ? responseMap[m.user_id] === group.key : !responseMap[m.user_id]
                          )
                          if (groupMembers.length === 0) return null
                          return (
                            <div key={group.key || 'none'} style={{ marginBottom:12 }}>
                              <div style={{
                                display:'inline-flex', alignItems:'center',
                                padding:'2px 10px', borderRadius:99, marginBottom:6,
                                background:group.bg, color:group.color, fontSize:11, fontWeight:700,
                              }}>
                                {group.label} · {groupMembers.length}
                              </div>
                              {groupMembers.map(m => (
                                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 4px', borderBottom:'0.5px solid var(--border)' }}>
                                  <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, background:'var(--bg3)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'var(--accent)' }}>
                                    {m.profiles?.avatar_url
                                      ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                      : (m.profiles?.full_name||'?')[0]}
                                  </div>
                                  <div style={{ flex:1, fontSize:13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    {m.profiles?.full_name}
                                    {m.user_id === user.id && <span style={{ fontSize:11, color:'var(--accent)', marginLeft:4 }}>· you</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })
                      )}

                      {poll.created_by === user.id && (
                        <button onClick={() => deletePoll(poll.id)} style={{
                          marginTop:4, width:'100%', padding:'9px',
                          background:'transparent', border:'1px solid rgba(224,85,85,0.35)',
                          borderRadius:'var(--radius-sm)', color:'#e05555',
                          fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif",
                        }}>
                          Delete poll
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── MEMBERS ── */}
        {tab === 'members' && (() => {
            const regularMembers = approved.filter(m => !m.is_guest)
            const guestMembers   = approved.filter(m => m.is_guest)
            return <>
              {/* Members — expanded by default */}
              <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', marginBottom:8, overflow:'hidden' }}>
                <div onClick={() => setMembersExpanded(e => !e)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', cursor:'pointer' }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>Members ({regularMembers.length})</span>
                  <span style={{ color:'var(--text3)', fontSize:16, display:'inline-block', transition:'transform 0.2s', transform: membersExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                </div>
                {membersExpanded && (
                  <div style={{ borderTop:'0.5px solid var(--border)' }}>
                    {regularMembers.length === 0
                      ? <div style={{ padding:'16px 14px', fontSize:13, color:'var(--text3)' }}>No members yet</div>
                      : regularMembers.map(m => (
                        <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'0.5px solid var(--border)' }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:'var(--bg3)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--accent)' }}>
                            {m.profiles?.avatar_url
                              ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              : (m.profiles?.full_name||'?')[0]}
                          </div>
                          <div style={{ flex:1, fontSize:14, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {m.profiles?.full_name}
                            {m.role === 'moderator' && <span style={{ fontStyle:'italic', fontWeight:400, color:'var(--accent)', fontSize:12 }}> (mod)</span>}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>

              {/* Guests — collapsed by default */}
              {guestMembers.length > 0 && (
                <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', overflow:'hidden' }}>
                  <div onClick={() => setGuestsExpanded(e => !e)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', cursor:'pointer' }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>Guests ({guestMembers.length})</span>
                    <span style={{ color:'var(--text3)', fontSize:16, display:'inline-block', transition:'transform 0.2s', transform: guestsExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                  </div>
                  {guestsExpanded && (
                    <div style={{ borderTop:'0.5px solid var(--border)' }}>
                      {guestMembers.map(m => (
                        <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'0.5px solid var(--border)' }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--text3)' }}>
                            {(m.profiles?.full_name||'?')[0]}
                          </div>
                          <div style={{ flex:1, fontSize:14, fontWeight:500, color:'var(--text2)' }}>{m.profiles?.full_name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          })()}

        {/* ── MORE ── */}
        {tab === 'more' && (
          <div>
            <div className="section-label">Group</div>
            <div onClick={() => changeTab('members')} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--bg2)', border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 8,
              cursor: 'pointer',
            }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Members</span>
              <span style={{ fontSize: 18, color: 'var(--text3)' }}>›</span>
            </div>

            <div style={{ marginTop: 24 }}>
              <button
                onClick={async () => {
                  const ok = await confirmDialog('Leave this group?')
                  if (!ok) return
                  const myMem = members.find(m => m.user_id === user.id)
                  if (myMem) {
                    await supabase.from('memberships').delete().eq('id', myMem.id)
                  }
                  navigate('/groups')
                }}
                style={{
                  width: '100%', padding: '13px',
                  background: 'transparent', border: '1px solid rgba(224,85,85,0.3)',
                  borderRadius: 'var(--radius)', color: '#e05555',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                }}>
                Leave Group
              </button>
            </div>
          </div>
        )}

      </div>

      <GroupNav clubId={clubId} isMod={false} activeTab={
        tab === 'polls'                          ? 'polls'
        : tab === 'more' || tab === 'members'    ? 'more'
        : tab === 'session' || tab === 'home'    ? 'session'
        : 'session'
      } />

      {/* Start session modal */}
      {showStartModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px'
        }} onClick={() => setShowStartModal(false)}>
          <div style={{
            background:'var(--bg2)', borderRadius:16,
            padding:'24px 20px 28px', width:'100%', maxWidth:430, maxHeight:'85vh', overflowY:'auto'
          }} onClick={e => e.stopPropagation()}>

            {modalStep === 1 && <>
              <h3 style={{ fontSize:20, marginBottom:16 }}>Start Session</h3>

              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600, textTransform:'uppercase', marginBottom:8 }}>Match Type</div>
                <div style={{ display:'flex', gap:8 }}>
                  {['doubles','singles'].map(t => (
                    <button key={t} onClick={() => setModalMatchType(t)} style={{
                      flex:1, padding:'12px', borderRadius:'var(--radius)',
                      background: modalMatchType===t ? 'var(--accent-dim)' : 'var(--bg2)',
                      color: 'var(--accent)',
                      border: modalMatchType===t ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                      cursor:'pointer', fontWeight:600, fontSize:14, textTransform:'capitalize'
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600, textTransform:'uppercase', marginBottom:8 }}>Mode</div>
                <div style={{ display:'flex', gap:8 }}>
                  {[
                    { id:'free',     label:'Free Play',     desc:'You decide who plays who' },
                    { id:'rotation', label:'Auto Schedule', desc:'System generates fair rotation' },
                  ].map(m => (
                    <button key={m.id} onClick={() => setSessionMode(m.id)} style={{
                      flex:1, padding:'12px 8px', borderRadius:'var(--radius)',
                      background: sessionMode===m.id ? 'var(--accent-dim)' : 'var(--bg2)',
                      color: 'var(--accent)',
                      border: sessionMode===m.id ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                      cursor:'pointer', textAlign:'center', lineHeight:1.3
                    }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{m.label}</div>
                      <div style={{ fontSize:10, fontWeight:400, marginTop:3, opacity:0.7 }}>{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {sessionMode === 'free' ? (
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }} onClick={startSession}>
                  ▶ Start Free Play
                </button>
              ) : (
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }}
                  onClick={() => { setSelectedPlayerIds([]); setModalStep(2) }}>
                  Next — Select Players →
                </button>
              )}
              <button className="btn btn-ghost" style={{ width:'100%' }} onClick={() => setShowStartModal(false)}>Cancel</button>
            </>}

            {modalStep === 2 && <>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <button onClick={() => setModalStep(1)} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:20, padding:0 }}>←</button>
                <h3 style={{ fontSize:20, margin:0 }}>Who's Playing?</h3>
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600, textTransform:'uppercase' }}>
                  Select players ({selectedPlayerIds.length})
                </div>
                <button onClick={() => {
                  const allIds = approved.map(m => m.user_id)
                  setSelectedPlayerIds(selectedPlayerIds.length === allIds.length ? [] : allIds)
                }} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:13 }}>
                  {selectedPlayerIds.length === approved.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div style={{ marginBottom:20 }}>
                {approved.map(m => {
                  const sel = selectedPlayerIds.includes(m.user_id)
                  return (
                    <div key={m.id} onClick={() => setSelectedPlayerIds(prev =>
                      sel ? prev.filter(id => id !== m.user_id) : [...prev, m.user_id]
                    )} style={{
                      display:'flex', alignItems:'center', gap:12,
                      padding:'10px 12px', marginBottom:4,
                      background: sel ? 'rgba(122,164,196,0.1)' : 'var(--bg3)',
                      border:`1px solid ${sel ? 'rgba(122,164,196,0.35)' : 'transparent'}`,
                      borderRadius:'var(--radius-sm)', cursor:'pointer'
                    }}>
                      <div style={{
                        width:20, height:20, borderRadius:4, flexShrink:0,
                        background: sel ? 'var(--accent)' : 'var(--bg2)',
                        border:`1px solid ${sel ? 'var(--accent)' : 'var(--text3)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, color:'#fff'
                      }}>{sel ? '✓' : ''}</div>
                      <div style={{ flex:1, fontSize:14 }}>
                        {m.profiles?.full_name}
                        {m.is_guest && <span style={{ fontStyle:'italic', color:'var(--text3)', fontSize:13 }}> (guest)</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }}
                disabled={selectedPlayerIds.length < (modalMatchType === 'doubles' ? 4 : 2)}
                onClick={startSession}>
                ▶ Start with Auto Schedule
              </button>
              <button className="btn btn-ghost" style={{ width:'100%' }} onClick={() => setShowStartModal(false)}>Cancel</button>
            </>}

          </div>
        </div>
      )}

      <Toast message={toast} />
      {confirmModal}

      {/* ── Notification permission modal ── */}
      {showNotifModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.65)',
          zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center',
        }}>
          <div style={{
            background:'var(--bg)', borderRadius:'20px 20px 0 0',
            padding:'28px 24px 44px', width:'100%', maxWidth:430, textAlign:'center',
          }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🔔</div>
            <div style={{ fontSize:20, fontWeight:700, marginBottom:8, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              Stay in the loop
            </div>
            <div style={{ fontSize:14, color:'var(--text2)', lineHeight:1.6, marginBottom:28 }}>
              Get notified when a session poll is created, a match needs your confirmation, or results are posted.
            </div>
            <button className="btn btn-primary" style={{ marginBottom:10 }}
              onClick={async () => {
                setShowNotifModal(false)
                const ok = await subscribe(user.id)
                setNotifStatus(ok ? 'granted' : Notification.permission)
                if (ok) showToast('🔔 Notifications enabled!')
              }}>
              Enable Notifications
            </button>
            <button className="btn btn-ghost"
              onClick={() => setShowNotifModal(false)}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* ── Create Poll modal ── */}
      {showPollModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
          zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center',
        }} onClick={() => setShowPollModal(false)}>
          <div style={{
            background:'var(--bg)', borderRadius:'20px 20px 0 0',
            padding:'24px 20px 40px', width:'100%', maxWidth:430,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:20, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              New Session Poll
            </div>

            <div className="input-wrap">
              <label className="input-label">Session date</label>
              <input type="date" className="input" value={pollDate}
                onChange={e => setPollDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} />
            </div>

            <div className="input-wrap">
              <label className="input-label">Time (optional)</label>
              {[
                { label:'Start', h:pollStartH, setH:setPollStartH, m:pollStartM, setM:setPollStartM, ap:pollStartAP, setAP:setPollStartAP },
                { label:'End',   h:pollEndH,   setH:setPollEndH,   m:pollEndM,   setM:setPollEndM,   ap:pollEndAP,   setAP:setPollEndAP   },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <span style={{ fontSize:12, color:'var(--text3)', width:34, flexShrink:0 }}>{row.label}</span>
                  <select value={row.h} onChange={e => row.setH(e.target.value)} style={{
                    flex:'0 0 auto', width:56, padding:'7px 4px', borderRadius:'var(--radius-sm)',
                    background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)',
                    fontSize:13, textAlign:'center', cursor:'pointer',
                  }}>
                    <option value="">--</option>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <select value={row.m} onChange={e => row.setM(e.target.value)} style={{
                    flex:'0 0 auto', width:56, padding:'7px 4px', borderRadius:'var(--radius-sm)',
                    background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)',
                    fontSize:13, textAlign:'center', cursor:'pointer',
                  }}>
                    <option value="00">:00</option>
                    <option value="30">:30</option>
                  </select>
                  <div style={{ display:'flex', borderRadius:'var(--radius-sm)', overflow:'hidden', border:'1px solid var(--border)' }}>
                    {['AM','PM'].map(ap => (
                      <button key={ap} type="button" onClick={() => row.setAP(ap)} style={{
                        padding:'7px 8px',
                        background: row.ap === ap ? 'var(--accent)' : 'var(--bg3)',
                        color: row.ap === ap ? '#fff' : 'var(--text2)',
                        border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif",
                      }}>{ap}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="input-wrap">
              <label className="input-label">Note (optional)</label>
              <input className="input" placeholder="e.g. Court 3, bring shuttles" value={pollNotes}
                onChange={e => setPollNotes(e.target.value)} />
            </div>

            <button className="btn btn-primary" style={{ marginBottom:10 }}
              disabled={!pollDate || creatingPoll}
              onClick={createPoll}>
              {creatingPoll ? 'Creating…' : 'Send Poll to Members'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowPollModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Custom Poll modal ── */}
      {showCustomPollModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
          zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center',
        }} onClick={() => setShowCustomPollModal(false)}>
          <div style={{
            background:'var(--bg)', borderRadius:'20px 20px 0 0',
            padding:'24px 20px 40px', width:'100%', maxWidth:430,
            maxHeight:'90vh', overflowY:'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:6, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              Custom Poll
            </div>
            <div style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>
              Ask the group any question with custom answer choices.
            </div>
            <div className="input-wrap">
              <label className="input-label">Poll question</label>
              <input className="input" placeholder="e.g. Which venue should we play at?" value={customPollQ}
                onChange={e => setCustomPollQ(e.target.value)} />
            </div>
            <div className="input-wrap">
              <label className="input-label">Options (add at least 2, or leave empty for Yes / No / Maybe)</label>
              {customPollOptions.map((opt, idx) => (
                <div key={idx} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                  <input
                    className="input"
                    style={{ marginBottom:0, flex:1 }}
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={e => { const n = [...customPollOptions]; n[idx] = e.target.value; setCustomPollOptions(n) }}
                  />
                  {customPollOptions.length > 2 && (
                    <button
                      onClick={() => setCustomPollOptions(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:18, padding:'0 4px', lineHeight:1 }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setCustomPollOptions(prev => [...prev, ''])}
                style={{ background:'none', border:'1px dashed var(--border2)', borderRadius:'var(--radius-sm)', color:'var(--accent)', padding:'7px 14px', fontSize:13, fontWeight:600, cursor:'pointer', marginTop:4 }}>
                + Add option
              </button>
            </div>
            <div className="input-wrap">
              <label className="input-label">Details (optional)</label>
              <input className="input" placeholder="Extra context for members" value={customPollNotes}
                onChange={e => setCustomPollNotes(e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ marginBottom:10 }}
              disabled={!customPollQ.trim() || creatingCustomPoll}
              onClick={createCustomPoll}>
              {creatingCustomPoll ? 'Sending…' : 'Send Poll to Members'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowCustomPollModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
