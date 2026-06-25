import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { generateSchedule } from '../utils/scheduleGenerator'
import { usePushNotifications } from '../hooks/usePushNotifications'
import GroupNav from '../components/GroupNav'
import Toast from '../components/Toast'
import { useConfirm } from '../hooks/useConfirm'
import { DashboardSkeleton } from '../components/Skeleton'

export default function ModeratorDashboard() {
  const { clubId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [club, setClub] = useState(null)
  const [members, setMembers] = useState([])
  const [disputedMatches, setDisputedMatches] = useState([])
  const [pendingMatches, setPendingMatches] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [tab, setTab] = useState(searchParams.get('tab') || 'session')
  const [toast, setToast] = useState('')
  const [confirmDialog, confirmModal] = useConfirm()
  const [loading, setLoading] = useState(true)
  const [linkCopied, setLinkCopied] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [showStartModal, setShowStartModal] = useState(false)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([])
  const [modalMatchType, setModalMatchType] = useState('doubles')
  const [sessionMode, setSessionMode] = useState('free')
  const [modalStep, setModalStep] = useState(1)
  const [membersExpanded, setMembersExpanded] = useState(true)
  const [guestsExpanded, setGuestsExpanded] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [tileData, setTileData] = useState({})
  const [tileIndices, setTileIndices] = useState({ history:0, leaders:0, stats:0, polls:0, splits:0 })
  const [tileOpacity, setTileOpacity] = useState({ history:1, leaders:1, stats:1, polls:1, splits:1 })
  const tileTimers   = useRef({})
  const tileTransMs  = useRef({ history:2000, leaders:2000, stats:2000, polls:2000, splits:2000 })
  const [sessions, setSessions] = useState([])
  const [showPollModal, setShowPollModal] = useState(false)
  const [showCustomPollModal, setShowCustomPollModal] = useState(false)
  const [customPollQ, setCustomPollQ] = useState('')
  const [customPollNotes, setCustomPollNotes] = useState('')
  const [customPollOptions, setCustomPollOptions] = useState(['', ''])
  const [creatingCustomPoll, setCreatingCustomPoll] = useState(false)
  const [pollDate, setPollDate] = useState('')
  const [pollStartH, setPollStartH] = useState('')
  const [pollStartM, setPollStartM] = useState('00')
  const [pollStartAP, setPollStartAP] = useState('PM')
  const [pollEndH, setPollEndH] = useState('')
  const [pollEndM, setPollEndM] = useState('00')
  const [pollEndAP, setPollEndAP] = useState('PM')
  const [pollNotes, setPollNotes] = useState('')
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [activePolls, setActivePolls] = useState([])
  const [expandedPolls, setExpandedPolls] = useState({})
  const { sendPush, subscribe } = usePushNotifications()
  const [notifStatus, setNotifStatus] = useState(() =>
    Notification.permission === 'granted' || localStorage.getItem('push_subscribed') === '1'
      ? 'granted' : Notification.permission
  )
  const [showNotifModal, setShowNotifModal] = useState(false) // 'default'|'granted'|'denied'
  const [notifTitle, setNotifTitle] = useState('')
  const [notifBody, setNotifBody] = useState('')
  const [sendingNotif, setSendingNotif] = useState(false)
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
  }, [clubId])

  // Sync tab when GroupNav changes ?tab= param on the same route
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setTab(t)
  }, [searchParams])

  // Auto-expand a specific poll when navigated here from Home with openPollId
  useEffect(() => {
    const pollId = location.state?.openPollId
    if (pollId && activePolls.length > 0) {
      setExpandedPolls(prev => ({ ...prev, [pollId]: true }))
      setTab('polls')
      setSearchParams({ tab: 'polls' }, { replace: true })
    }
  }, [activePolls.length])

  useEffect(() => {
    if (loading) return
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
    setClubFeatures([])

    // Super admins bypass the membership guard
    const SUPER_ADMINS = ['sumit@shuttley.club']
    const isSuperAdmin = SUPER_ADMINS.includes(user?.email)

    const [{ data: clubData }, { data: myMem }] = await Promise.all([
      supabase.from('clubs').select('*').eq('id', clubId).single(),
      isSuperAdmin
        ? Promise.resolve({ data: null })
        : supabase.from('memberships').select('role, status').eq('club_id', clubId).eq('user_id', user.id).single(),
    ])
    setClub(clubData)

    if (!isSuperAdmin) {
      // Guard: redirect if current user is no longer a moderator
      if (!myMem || myMem.role !== 'moderator' || myMem.status !== 'approved') {
        navigate(`/club/${clubId}/member`, { replace: true })
        return
      }
    }

    const today = new Date().toISOString().split('T')[0]

    // Independent reads — fetched in parallel instead of one-by-one.
    const [
      { data: mems },
      { data: disputed },
      { data: pending },
      { data: session },
      { data: winMatches },
      { count: sCount },
      { data: sessDetail },
      { data: pollData },
      { data: featuresData },
    ] = await Promise.all([
      supabase.from('memberships').select('*, profiles(*)').eq('club_id', clubId).order('joined_at', { ascending: false }),
      supabase.from('matches').select('*, match_players(user_id, side, profiles(full_name))').eq('club_id', clubId).eq('status', 'disputed'),
      supabase.from('matches').select('*, match_players(user_id, side, profiles(full_name))').eq('club_id', clubId).eq('status', 'pending'),
      supabase.from('sessions').select('*').eq('club_id', clubId).eq('status', 'active').maybeSingle(),
      supabase.from('matches').select('winner_side, team1_score, team2_score, played_at, match_players(user_id, side, profiles(full_name))').eq('club_id', clubId).eq('status', 'confirmed'),
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('club_id', clubId),
      supabase.from('sessions').select('id, name, started_at, ended_at, status, rotation_player_ids, match_type, matches(count)').eq('club_id', clubId).order('started_at', { ascending: false }),
      supabase.from('session_polls').select('*, poll_responses(*)').eq('club_id', clubId).eq('status', 'open').or(`session_date.gte.${today},session_date.is.null`).order('session_date', { ascending: true, nullsFirst: false }),
      supabase.from('club_features').select('*').eq('club_id', clubId),
    ])

    setMembers(mems || [])
    setDisputedMatches(disputed || [])
    setPendingMatches(pending || [])
    setActiveSession(session || null)

    const wm = winMatches || []
    setMatchCount(wm.length)

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

    // Streak
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

    // Sessions detail
    const sd = sessDetail || []
    setSessions(sd)
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

    setTileData({ topPlayer, topPair, topRate, sessionCount: sCount || 0, topStreak, recentDates,
      recentMatchCount: recentWm.length, lastSessionDate, mostActiveMonth, avgPlayers })

    // Active polls — only today or future (auto-expire by session date)
    setActivePolls(pollData || [])

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
    if (error) { setCreatingPoll(false); return }

    // Send push to all approved members including the creator
    const memberUserIds = members
      .filter(m => m.status === 'approved')
      .map(m => m.user_id)
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
    setPollDate(''); setPollStartH(''); setPollStartM('00'); setPollStartAP('PM'); setPollEndH(''); setPollEndM('00'); setPollEndAP('PM'); setPollNotes('')
    fetchData()
  }

  async function closePoll(pollId) {
    await supabase.from('session_polls').update({ status: 'closed' }).eq('id', pollId)
    fetchData()
  }

  async function createCustomPoll() {
    if (!customPollQ.trim()) return
    setCreatingCustomPoll(true)

    const filledOpts = customPollOptions.map(o => o.trim()).filter(Boolean)
    let notesContent
    if (filledOpts.length >= 2) {
      // Custom options mode — store as JSON
      notesContent = JSON.stringify({
        q: customPollQ.trim(),
        opts: filledOpts,
        ...(customPollNotes.trim() ? { note: customPollNotes.trim() } : {}),
      })
    } else {
      // Legacy plain-text mode (Yes/No/Maybe)
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
    setCustomPollQ('')
    setCustomPollNotes('')
    setCustomPollOptions(['', ''])
    fetchData()
  }

  function startSessionFromPoll(poll) {
    const yesVoters = poll.poll_responses
      ?.filter(r => r.response === 'yes')
      .map(r => r.user_id) || []
    setSelectedPlayerIds(yesVoters)
    setSessionMode('free')
    setModalStep(2)
    setShowStartModal(true)
  }

  function formatPollDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
  }

  function parseCustomPollNotes(notes) {
    if (!notes) return { question: '', options: null, note: null }
    try {
      const p = JSON.parse(notes)
      if (p.q) return { question: p.q, options: Array.isArray(p.opts) && p.opts.length >= 2 ? p.opts : null, note: p.note || null }
    } catch {}
    const parts = notes.split('\n')
    return { question: parts[0], options: null, note: parts.slice(1).join('\n') || null }
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

  async function updateMemberStatus(membershipId, status) {
    await supabase.from('memberships').update({ status }).eq('id', membershipId)
    showToast(status === 'approved' ? '✔ Member approved' : '✘ Member rejected')
    fetchData()
  }

  async function promoteMod(membershipId) {
    if (!(await confirmDialog('Make this person a moderator?'))) return
    await supabase.from('memberships').update({ role: 'moderator' }).eq('id', membershipId)
    showToast('Promoted to moderator')
    fetchData()
  }

  async function demoteMod(membershipId) {
    const target = members.find(m => m.id === membershipId)
    const moderatorCount = members.filter(m => m.status === 'approved' && m.role === 'moderator').length
    if (target?.role === 'moderator' && moderatorCount <= 1) {
      showToast('Group must have at least one moderator')
      return
    }
    if (!(await confirmDialog('Remove moderator rights and make this person a regular member?'))) return
    await supabase.from('memberships').update({ role: 'member' }).eq('id', membershipId)
    showToast('Moderator rights removed')
    fetchData()
  }

  async function removeMember(membershipId) {
    const target = members.find(m => m.id === membershipId)
    const moderatorCount = members.filter(m => m.status === 'approved' && m.role === 'moderator').length
    if (target?.role === 'moderator' && moderatorCount <= 1) {
      showToast('Group must have at least one moderator')
      return
    }
    if (!(await confirmDialog('Remove this member from the club?'))) return
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

  function getSessionName() {
    const now = new Date()
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]
    const day = now.getDate()
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]
    const year = String(now.getFullYear()).slice(-2)
    return `${weekday} ${day} ${month} ${year}`
  }

  async function startSessionWithRotation() {
    const { data: existing } = await supabase
      .from('sessions').select('id, name').eq('club_id', clubId).eq('status', 'active').maybeSingle()
    if (existing) {
      showToast(`"${existing.name}" is still active. End it before starting a new session.`)
      setShowStartModal(false)
      fetchData()
      return
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
      rotation_player_ids: selectedPlayerIds
    }).select().single()
    if (error) { console.error('startSession error:', error); showToast('Error: ' + error.message); return }

    if (sessionMode === 'rotation') {
      const schedule = generateSchedule(selectedPlayerIds, modalMatchType)
      if (schedule.length > 0) {
        const { error: rmError } = await supabase.from('rotation_matches').insert(
          schedule.map((m, i) => ({ ...m, session_id: sess.id, club_id: clubId, seq: i + 1, status: 'pending' }))
        )
        if (rmError) {
          console.error('rotation schedule error:', rmError)
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
      if (!(await confirmDialog(`${word} still pending. You can confirm them after the session ends. End session anyway?`))) return
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

  async function resolveDispute(matchId, resolution) {
    if (resolution === 'void') {
      if (!(await confirmDialog('This will delete the match entirely. Are you sure?'))) return
      const { error: e1 } = await supabase.from('match_players').delete().eq('match_id', matchId)
      if (e1) { showToast('Error voiding match'); return }
      const { error: e2 } = await supabase.from('matches').delete().eq('id', matchId)
      if (e2) { showToast('Error voiding match'); return }
      showToast('Match voided')
    } else {
      const { error } = await supabase.from('matches').update({ status: 'confirmed' }).eq('id', matchId)
      if (error) { showToast('Error confirming match'); return }
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

  if (loading) return <DashboardSkeleton />

  const pending = members.filter(m => m.status === 'pending')
  const approved = members.filter(m => m.status === 'approved' && !m.profiles?.full_name?.startsWith('deleted_'))
  const alertCount = disputedMatches.length + pendingMatches.length
  const firstName = profile?.full_name?.split(' ')[0] || ''

  return (
    <div className="page">
      {/* Top nav */}
      <div className="topnav">
        <div>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:16, fontWeight:700, color:'var(--text)' }}>{club?.name}</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Moderator</div>
        </div>
      </div>

      {/* Tab content */}
      <div className="content">

        {/* ── SESSION ── */}
        {tab === 'session' && <>

          {/* Session hero card */}
          {activeSession ? (
            <div style={{ background:'var(--accent)', borderRadius:'var(--radius)', padding:'20px', marginBottom:16, color:'#fff' }}>
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>● Session in Progress</div>
              <div style={{ fontSize:22, fontWeight:700, marginBottom:4, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{activeSession.name}</div>
              <div style={{ fontSize:13, opacity:0.75, marginBottom:16, lineHeight:1.4 }}>A session is currently running. Tap to continue.</div>
              <div style={{ display:'flex', gap:8 }}>
                <button
                  onClick={() => navigate(`/club/${clubId}/session/${activeSession.id}/rotation`)}
                  style={{ flex:1, background:'#fff', color:'var(--accent)', border:'none', borderRadius:'var(--radius-sm)', padding:'10px', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  Open Current Session
                </button>
                <button
                  onClick={endSession}
                  style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.35)', borderRadius:'var(--radius-sm)', padding:'10px 16px', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  End
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background:'var(--accent)', borderRadius:'var(--radius)', padding:'20px', marginBottom:16, color:'#fff' }}>
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

          {/* Pending members alert */}
          {pending.length > 0 && (
            <div onClick={() => changeTab('members')} style={{
              display:'flex', alignItems:'center', gap:12,
              background:'rgba(255,200,50,0.07)', border:'1px solid rgba(255,200,50,0.3)',
              borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:12, cursor:'pointer',
            }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#ffc832' }}>
                  {pending.length} member{pending.length !== 1 ? 's' : ''} awaiting approval
                </div>
                <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>Tap to review in Members</div>
              </div>
              <span style={{ color:'var(--text3)', fontSize:18 }}>›</span>
            </div>
          )}

          {/* Disputes alert */}
          {alertCount > 0 && (
            <div onClick={() => changeTab('sessions')} style={{
              display:'flex', alignItems:'center', gap:12,
              background:'rgba(224,85,85,0.06)', border:'1px solid rgba(224,85,85,0.2)',
              borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:12, cursor:'pointer',
            }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--danger)' }}>
                  {alertCount} match{alertCount !== 1 ? 'es' : ''} need attention
                </div>
                <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                  {[
                    disputedMatches.length > 0 && `${disputedMatches.length} disputed`,
                    pendingMatches.length > 0 && `${pendingMatches.length} pending confirmation`,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ color:'var(--text3)', fontSize:18 }}>›</span>
            </div>
          )}

          {/* Past sessions */}
          {sessions.filter(s => s.status === 'ended').length > 0 && (
            <div>
              <div className="section-label">Past sessions</div>
              {sessions.filter(s => s.status === 'ended').slice(0, 8).map(s => (
                <div key={s.id} onClick={() => navigate(`/club/${clubId}/session/${s.id}`)}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 0', borderBottom:'0.5px solid var(--border)', cursor:'pointer' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name || 'Session'}</div>
                    <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                      {s.rotation_player_ids?.length > 0 ? `${s.rotation_player_ids.length} players` : s.match_type || '—'}
                      {s.matches?.[0]?.count > 0 && ` · ${s.matches[0].count} match${s.matches[0].count !== 1 ? 'es' : ''}`}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text3)', flexShrink:0 }}>
                    {s.ended_at ? new Date(s.ended_at).toLocaleDateString('en-AU', { day:'numeric', month:'short' }) : '—'}
                  </div>
                  <span style={{ fontSize:16, color:'var(--text3)', flexShrink:0 }}>›</span>
                </div>
              ))}
              {sessions.filter(s => s.status === 'ended').length > 8 && (
                <div onClick={() => changeTab('sessions')}
                  style={{ fontSize:13, color:'var(--accent)', fontWeight:600, textAlign:'center', padding:'14px 0', cursor:'pointer' }}>
                  View all in Moderator Tools →
                </div>
              )}
            </div>
          )}

          {sessions.filter(s => s.status === 'ended').length === 0 && !activeSession && (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>No past sessions yet. Start one above!</p>
            </div>
          )}

        </>}

        {/* ── HOME (legacy tile dashboard) ── */}
        {tab === 'home' && <>

          {/* Session hero card */}
          {activeSession ? (
            <div style={{
              background: 'var(--accent)', borderRadius: 'var(--radius)',
              padding: '20px', marginBottom: 16, color: '#fff',
            }}>
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>● Session in Progress</div>
              <div style={{ fontSize:22, fontWeight:700, marginBottom:4, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{activeSession.name}</div>
              <div style={{ fontSize:13, opacity:0.75, marginBottom:16, lineHeight:1.4 }}>A session is currently running. Tap to continue.</div>
              <div style={{ display:'flex', gap:8 }}>
                <button
                  onClick={() => navigate(`/club/${clubId}/session/${activeSession.id}/rotation`)}
                  style={{ flex:1, background:'#fff', color:'var(--accent)', border:'none', borderRadius:'var(--radius-sm)', padding:'10px', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
                  Open Current Session
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
              background: 'var(--accent)', borderRadius: 'var(--radius)',
              padding: '20px', marginBottom: 16, color: '#fff',
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

          {/* Pending members alert */}
          {pending.length > 0 && (
            <div onClick={() => changeTab('members')} style={{
              display:'flex', alignItems:'center', gap:12,
              background:'rgba(255,200,50,0.07)', border:'1px solid rgba(255,200,50,0.3)',
              borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:12, cursor:'pointer',
            }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#ffc832' }}>
                  {pending.length} member{pending.length !== 1 ? 's' : ''} awaiting approval
                </div>
                <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>Tap to review</div>
              </div>
              <span style={{ color:'var(--text3)', fontSize:18 }}>›</span>
            </div>
          )}

          {/* Disputes / pending matches alert */}
          {alertCount > 0 && (
            <div onClick={() => changeTab('sessions')} style={{
              display:'flex', alignItems:'center', gap:12,
              background:'rgba(224,85,85,0.06)', border:'1px solid rgba(224,85,85,0.2)',
              borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:12, cursor:'pointer',
            }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--danger)' }}>
                  {alertCount} match{alertCount !== 1 ? 'es' : ''} need attention
                </div>
                <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                  {[
                    disputedMatches.length > 0 && `${disputedMatches.length} disputed`,
                    pendingMatches.length > 0 && `${pendingMatches.length} pending confirmation`,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ color:'var(--text3)', fontSize:18 }}>›</span>
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
                  { info: td.topRate ? `${td.topRate.name?.split(' ')[0]} · ${td.topRate.rate}% win rate` : (matchCount > 0 ? `${matchCount} matches` : 'No data yet'), sub: 'Best win rate' },
                  { info: td.topPlayer ? `${td.topPlayer.name?.split(' ')[0]} · ${td.topPlayer.wins}W` : 'No data yet', sub: 'Most wins' },
                  { info: `${approved.filter(m => !m.is_guest).length} players`, sub: null },
                  { info: td.topPair ? `${td.topPair.names.map(n => n?.split(' ')[0]).join(' & ')}` : 'No data yet', sub: 'Top pair' },
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
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
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
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.3 }}>
                          {new Date(poll.session_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })}
                        </div>
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
                    <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text)', width:76, flexShrink:0 }}>
                      Splits
                    </div>
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
                    <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text)', width:76, flexShrink:0 }}>
                      Chat
                    </div>
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

        {/* ── POLLS ── */}
        {tab === 'polls' && (
          <div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <button onClick={() => { setPollDate(''); setPollStartH(''); setPollStartM('00'); setPollStartAP('PM'); setPollEndH(''); setPollEndM('00'); setPollEndAP('PM'); setPollNotes(''); setShowPollModal(true) }} style={{
                flex:1, padding:'11px',
                background:'transparent', border:'1.5px dashed var(--border2)',
                borderRadius:'var(--radius)', color:'var(--accent)',
                fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif",
              }}>
                + Session Poll
              </button>
              <button onClick={() => { setCustomPollQ(''); setCustomPollNotes(''); setCustomPollOptions(['', '']); setShowCustomPollModal(true) }} style={{
                flex:1, padding:'11px',
                background:'transparent', border:'1.5px dashed var(--border2)',
                borderRadius:'var(--radius)', color:'var(--accent)',
                fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif",
              }}>
                + Custom Poll
              </button>
            </div>
            {activePolls.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📊</div>
                <p>No active polls right now</p>
              </div>
            ) : activePolls.map(poll => {
              const responseMap = {}
              poll.poll_responses?.forEach(r => { responseMap[r.user_id] = r.response })
              const isCustom = !poll.session_date
              const dateLabel = isCustom ? null : formatPollDate(poll.session_date)
              const parsedCustom = isCustom ? parseCustomPollNotes(poll.notes) : null
              const hasCustomOpts = !!parsedCustom?.options
              const myResp = poll.poll_responses?.find(r => r.user_id === user.id)?.response
              const regularMembers = approved.filter(m => !m.is_guest)
              const pendingCount = regularMembers.filter(m => !responseMap[m.user_id]).length
              const isExpanded = !!expandedPolls[poll.id]

              // Vote counts (standard or custom options)
              const yes   = poll.poll_responses?.filter(r => r.response === 'yes').length   || 0
              const no    = poll.poll_responses?.filter(r => r.response === 'no').length    || 0
              const maybe = poll.poll_responses?.filter(r => r.response === 'maybe').length || 0
              const optionCounts = hasCustomOpts
                ? Object.fromEntries(parsedCustom.options.map(opt => [
                    opt, poll.poll_responses?.filter(r => r.response === opt).length || 0
                  ]))
                : null

              // Response options to render
              const standardOpts = [
                { key:'yes',   label:'Yes',   color:'#2a8c55', bg:'rgba(42,140,85,0.1)',  border:'rgba(42,140,85,0.3)'  },
                { key:'no',    label:'No',    color:'#e05555', bg:'rgba(224,85,85,0.1)',  border:'rgba(224,85,85,0.3)'  },
                { key:'maybe', label:'Maybe', color:'#a07800', bg:'rgba(255,200,50,0.1)', border:'rgba(220,175,20,0.3)' },
              ]

              return (
                <div key={poll.id} style={{
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

                      {/* Your response */}
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
                              transition:'all 0.15s ease',
                              display:'flex', alignItems:'center', justifyContent:'space-between',
                            }}>
                              <span>{opt}</span>
                              {myResp === opt && <span style={{ fontSize:11 }}>✓</span>}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                          {standardOpts.map(opt => (
                            <button key={opt.key} onClick={() => updatePollResponse(poll.id, opt.key)} style={{
                              flex:1, padding:'9px 4px', borderRadius:'var(--radius-sm)',
                              fontSize:13, fontWeight: myResp === opt.key ? 700 : 500,
                              cursor:'pointer', fontFamily:"'Inter',sans-serif",
                              background: myResp === opt.key ? opt.bg : 'transparent',
                              color: myResp === opt.key ? opt.color : 'var(--text2)',
                              border: `1.5px solid ${myResp === opt.key ? opt.border : 'var(--border)'}`,
                              transition:'all 0.15s ease',
                            }}>{opt.label}</button>
                          ))}
                        </div>
                      )}

                      {/* Grouped responses */}
                      {hasCustomOpts ? (
                        // Custom option groups
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

                      {/* Start Session / Open Session — session polls only */}
                      {!isCustom && (
                        activeSession ? (
                          <button onClick={() => navigate(`/club/${clubId}/session/${activeSession.id}/rotation`)} style={{
                            marginTop:4, marginBottom:8, width:'100%', padding:'9px',
                            background:'var(--accent)', border:'none',
                            borderRadius:'var(--radius-sm)', color:'#fff',
                            fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif",
                          }}>
                            Open Current Session →
                          </button>
                        ) : (
                          <button onClick={() => startSessionFromPoll(poll)} style={{
                            marginTop:4, marginBottom:8, width:'100%', padding:'9px',
                            background:'var(--accent-dim)', border:'1.5px solid var(--accent)',
                            borderRadius:'var(--radius-sm)', color:'var(--accent)',
                            fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif",
                          }}>
                            ▶ Start Session from this Poll
                          </button>
                        )
                      )}

                      {/* Delete poll */}
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
        {tab === 'members' && <>
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
                      : <div className="member-avatar-init">{(m.profiles?.full_name||'?')[0].toUpperCase()}</div>
                    }
                  </div>
                  <div className="member-info">
                    <div className="member-name" style={{ color: m.profiles?.full_name?.startsWith('deleted_') ? 'var(--text3)' : 'var(--text)', fontStyle: m.profiles?.full_name?.startsWith('deleted_') ? 'italic' : 'normal' }}>{m.profiles?.full_name || '?'}</div>
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

          {(() => {
            const regularMembers = approved.filter(m => !m.is_guest)
            const guestMembers   = approved.filter(m => m.is_guest)
            const memberRow = (m) => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'0.5px solid var(--border)' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:'var(--bg3)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--accent)' }}>
                  {m.profiles?.avatar_url
                    ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : (m.profiles?.full_name||'?')[0]}
                </div>
                <div style={{ flex:1, minWidth:0, fontSize:14, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {m.profiles?.full_name}
                  {m.role === 'moderator' && <span style={{ fontStyle:'italic', fontWeight:400, color:'var(--accent)', fontSize:12 }}> (mod)</span>}
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {m.role !== 'moderator' && !m.profiles?.full_name?.startsWith('deleted_') && <button className="btn btn-ghost btn-sm" onClick={() => promoteMod(m.id)} style={{ padding:'4px 10px', fontSize:11 }}>Make Moderator</button>}
                  {m.role === 'moderator' && m.user_id !== user.id && <button className="btn btn-ghost btn-sm" onClick={() => demoteMod(m.id)} style={{ padding:'4px 10px', fontSize:11 }}>Remove Moderator</button>}
                  {m.user_id !== user.id && <button className="btn btn-danger btn-sm" onClick={() => removeMember(m.id)} style={{ padding:'4px 10px', fontSize:11 }}>Remove</button>}
                </div>
              </div>
            )
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
                      : regularMembers.map(memberRow)}
                  </div>
                )}
              </div>

              {/* Guests — collapsed by default */}
              <div style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-sm)', marginBottom:12, overflow:'hidden' }}>
                <div onClick={() => setGuestsExpanded(e => !e)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', cursor:'pointer' }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>Guests ({guestMembers.length})</span>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setShowGuestForm(g => !g) }} style={{ fontSize:11, padding:'3px 10px' }}>+ Guest</button>
                    <span style={{ color:'var(--text3)', fontSize:16, display:'inline-block', transition:'transform 0.2s', transform: guestsExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                  </div>
                </div>
                {showGuestForm && (
                  <div style={{ padding:'0 14px 12px', borderTop:'0.5px solid var(--border)' }}>
                    <div style={{ fontSize:12, color:'var(--text2)', margin:'10px 0 8px' }}>Guest players appear in matches but not on the leaderboard.</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <input className="input" placeholder="Guest name e.g. John" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ flex:1 }} onKeyDown={e => e.key === 'Enter' && addGuest()} />
                      <button className="btn btn-primary btn-sm" onClick={addGuest} disabled={!guestName.trim() || addingGuest}>{addingGuest ? '…' : 'Add'}</button>
                    </div>
                  </div>
                )}
                {guestsExpanded && (
                  <div style={{ borderTop:'0.5px solid var(--border)' }}>
                    {guestMembers.length === 0
                      ? <div style={{ padding:'16px 14px', fontSize:13, color:'var(--text3)' }}>No guests yet. Add one above.</div>
                      : guestMembers.map(m => (
                        <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'0.5px solid var(--border)' }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'var(--text3)' }}>
                            {(m.profiles?.full_name||'?')[0]}
                          </div>
                          <div style={{ flex:1, fontSize:14, fontWeight:500, color:'var(--text2)' }}>{m.profiles?.full_name}</div>
                          <button className="btn btn-danger btn-sm" onClick={() => removeMember(m.id)} style={{ padding:'4px 10px', fontSize:11 }}>Remove</button>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            </>
          })()}
        </>}

        {/* ── SESSION (disputes + session history) ── */}
        {tab === 'sessions' && <>
          {pendingMatches.length > 0 && <>
            <div className="section-label" style={{ color:'#ffc832' }}>
              ⏳ Pending Confirmation ({pendingMatches.length})
            </div>
            {pendingMatches.map(match => (
              <div key={match.id} className="card" style={{ marginBottom:12, border:'1px solid rgba(255,200,50,0.3)' }}>
                <div style={{ fontSize:11, color:'#ffc832', fontWeight:600, marginBottom:8, textTransform:'uppercase' }}>
                  Awaiting confirmation
                </div>
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
                    onClick={() => confirmMatch(match.id)}>
                    ✔ Confirm
                  </button>
                  <button className="btn btn-danger btn-sm" style={{ flex:1 }}
                    onClick={() => resolveDispute(match.id, 'void')}>
                    ✕ Void
                  </button>
                </div>
              </div>
            ))}
            <hr className="divider" />
          </>}

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

          {/* ── Session History ── */}
          <hr className="divider" />
          <div className="section-label">Past Sessions ({sessions.filter(s => s.status === 'ended').length})</div>
          {sessions.filter(s => s.status === 'ended').length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🏸</div>
              <p>No sessions recorded yet</p>
            </div>
          ) : sessions.filter(s => s.status === 'ended').map(s => (
            <div key={s.id} onClick={() => navigate(`/club/${clubId}/session/${s.id}`)}
              style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'11px 0', borderBottom:'0.5px solid var(--border)',
                cursor:'pointer',
              }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                  {s.rotation_player_ids?.length > 0 ? `${s.rotation_player_ids.length} players` : s.match_type || '—'}
                  {s.matches?.[0]?.count > 0 && ` · ${s.matches[0].count} match${s.matches[0].count !== 1 ? 'es' : ''}`}
                </div>
              </div>
              <div style={{ fontSize:12, color:'var(--text3)', flexShrink:0 }}>
                {s.ended_at ? new Date(s.ended_at).toLocaleDateString('en-AU', { day:'numeric', month:'short' }) : '—'}
              </div>
              <span style={{ fontSize:16, color:'var(--text3)', flexShrink:0 }}>›</span>
            </div>
          ))}
        </>}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && <>
          <div className="section-label">Invite link</div>
          <div className="card" style={{ marginBottom:20 }}>
            <p style={{ fontSize:13,color:'var(--text2)',marginBottom:12,lineHeight:1.6 }}>
              Share this link so people can find and request to join your group instantly.
            </p>
            <div style={{ background:'var(--bg3)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text2)',marginBottom:12,wordBreak:'break-all' }}>
              {window.location.origin}/join/{club?.invite_code}
            </div>
            <button className="btn btn-primary" onClick={copyInviteLink}>
              {linkCopied ? '✔ Copied!' : '🔗 Copy invite link'}
            </button>
          </div>

          <div className="section-label">Notifications</div>
          <div style={{
            background:'var(--bg2)', border:'0.5px solid var(--border)',
            borderLeft:'4px solid var(--accent)',
            borderRadius:'var(--radius)', padding:'12px 16px', marginBottom:20,
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
          }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                {notifStatus === 'granted' ? '🔔 Notifications enabled' : notifStatus === 'denied' ? '🔕 Notifications blocked' : '🔔 Enable notifications'}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>
                {notifStatus === 'granted' ? 'You\'ll get notified for polls and session updates' : notifStatus === 'denied' ? 'Unblock in your browser settings to enable' : 'Get notified for polls, sessions and match results'}
              </div>
            </div>
            {notifStatus !== 'denied' && (
              <button className="btn btn-primary btn-sm" style={{ flexShrink:0 }}
                disabled={notifStatus === 'granted'}
                onClick={async () => {
                  const ok = await subscribe(user.id)
                  setNotifStatus(ok ? 'granted' : Notification.permission)
                  if (ok) showToast('🔔 Notifications enabled!')
                  else showToast('Could not enable notifications')
                }}>
                {notifStatus === 'granted' ? '✔ On' : 'Enable'}
              </button>
            )}
          </div>

          <div className="section-label">Send Announcement</div>
          <div style={{
            background:'var(--bg2)', border:'0.5px solid var(--border)',
            borderLeft:'4px solid var(--accent)',
            borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:20,
          }}>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12, lineHeight:1.5 }}>
              Send a custom push notification to all group members
            </div>
            <div className="input-wrap" style={{ marginBottom:10 }}>
              <label className="input-label">Title</label>
              <input className="input" placeholder={`e.g. ${club?.name} Update`}
                value={notifTitle} onChange={e => setNotifTitle(e.target.value)} />
            </div>
            <div className="input-wrap" style={{ marginBottom:14 }}>
              <label className="input-label">Message</label>
              <input className="input" placeholder="e.g. Court booking confirmed for Saturday!"
                value={notifBody} onChange={e => setNotifBody(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm"
              disabled={!notifTitle.trim() || sendingNotif}
              onClick={async () => {
                setSendingNotif(true)
                const memberIds = members.filter(m => m.status === 'approved').map(m => m.user_id)
                await sendPush(memberIds, notifTitle.trim(), notifBody.trim(), '/')
                setSendingNotif(false)
                setNotifTitle('')
                setNotifBody('')
                showToast('📣 Announcement sent!')
              }}>
              {sendingNotif ? 'Sending…' : '📣 Send to all members'}
            </button>
          </div>

          <div className="section-label">Group info</div>
          <div className="card">
            <div style={{ fontSize:13,color:'var(--text2)',marginBottom:4 }}>Group name</div>
            <div style={{ fontSize:15,fontWeight:500 }}>{club?.name}</div>
            {club?.description && <>
              <div style={{ fontSize:13,color:'var(--text2)',marginTop:12,marginBottom:4 }}>Description</div>
              <div style={{ fontSize:14 }}>{club?.description}</div>
            </>}
          </div>
        </>}

        {/* ── MORE ── */}
        {tab === 'more' && (
          <div>
            <div className="section-label">Group</div>
            {[
              { label: 'Members', badge: pending.length, onClick: () => changeTab('members') },
              { label: 'Moderator Tools', badge: alertCount, onClick: () => changeTab('settings') },
            ].map(item => (
              <div key={item.label} onClick={item.onClick} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 8,
                cursor: 'pointer', position: 'relative',
              }}>
                {item.badge > 0 && (
                  <span style={{
                    position: 'absolute', top: 8, right: 36,
                    background: '#ff5c5c', color: '#fff', borderRadius: 99,
                    fontSize: 9, fontWeight: 700, minWidth: 16, height: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>{item.badge}</span>
                )}
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{item.label}</span>
                <span style={{ fontSize: 18, color: 'var(--text3)' }}>›</span>
              </div>
            ))}

            <div style={{ marginTop: 24 }}>
              <button
                onClick={async () => {
                  const ok = await confirmDialog('Leave this group? You will lose moderator access.')
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

      {/* Tab bar */}
      <GroupNav clubId={clubId} isMod={true} activeTab={
        tab === 'polls'                                                              ? 'polls'
        : tab === 'more' || tab === 'members' || tab === 'sessions' || tab === 'settings' ? 'more'
        : tab === 'session' || tab === 'home'                                       ? 'session'
        : 'session'
      } />

      {/* Start session modal */}
      {showStartModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          zIndex:200, display:'flex', alignItems:'center', justifyContent:'center',
          padding:'0 20px'
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

              <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }}
                onClick={() => { setModalStep(2) }}>
                Next — Who's Available? →
              </button>
              <button className="btn btn-ghost" style={{ width:'100%' }} onClick={() => setShowStartModal(false)}>
                Cancel
              </button>
            </>}

            {modalStep === 2 && <>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <button onClick={() => setModalStep(1)} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:20, padding:0 }}>←</button>
                <h3 style={{ fontSize:20, margin:0 }}>
                  {sessionMode === 'free' ? "Who's Available Today?" : "Who's Playing?"}
                </h3>
              </div>

              {sessionMode === 'free' && (
                <div style={{ fontSize:13, color:'var(--text2)', marginBottom:14, lineHeight:1.5 }}>
                  Select everyone who is present. You can add more players during the session.
                </div>
              )}

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600, textTransform:'uppercase' }}>
                  Available ({selectedPlayerIds.length})
                </div>
                <button onClick={() => {
                  const allIds = approved.map(m => m.user_id)
                  setSelectedPlayerIds(selectedPlayerIds.length === allIds.length ? [] : allIds)
                }} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:13 }}>
                  {selectedPlayerIds.length === approved.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Available section */}
              {selectedPlayerIds.length > 0 && (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:11, color:'#2a8c55', fontWeight:700, textTransform:'uppercase', marginBottom:6, letterSpacing:'0.06em' }}>
                    Available · {selectedPlayerIds.length}
                  </div>
                  {approved.filter(m => selectedPlayerIds.includes(m.user_id)).map(m => (
                    <div key={m.id} onClick={() => setSelectedPlayerIds(prev => prev.filter(id => id !== m.user_id))}
                      style={{
                        display:'flex', alignItems:'center', gap:12,
                        padding:'10px 12px', marginBottom:4,
                        background:'rgba(42,140,85,0.07)', border:'1px solid rgba(42,140,85,0.25)',
                        borderRadius:'var(--radius-sm)', cursor:'pointer'
                      }}>
                      <div style={{
                        width:20, height:20, borderRadius:4, flexShrink:0,
                        background:'#2a8c55', border:'1px solid #2a8c55',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, color:'#fff'
                      }}>✓</div>
                      <div style={{ flex:1, fontSize:14 }}>
                        {m.profiles?.full_name}
                        {m.is_guest && <span style={{ fontStyle:'italic', color:'var(--text3)', fontSize:13 }}> (guest)</span>}
                      </div>
                      <span style={{ fontSize:11, color:'var(--text3)' }}>tap to remove</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Not available section */}
              {approved.filter(m => !selectedPlayerIds.includes(m.user_id)).length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', marginBottom:6, letterSpacing:'0.06em' }}>
                    Not Available · {approved.filter(m => !selectedPlayerIds.includes(m.user_id)).length}
                  </div>
                  {approved.filter(m => !selectedPlayerIds.includes(m.user_id)).map(m => (
                    <div key={m.id} onClick={() => setSelectedPlayerIds(prev => [...prev, m.user_id])}
                      style={{
                        display:'flex', alignItems:'center', gap:12,
                        padding:'10px 12px', marginBottom:4,
                        background:'var(--bg3)', border:'1px solid transparent',
                        borderRadius:'var(--radius-sm)', cursor:'pointer'
                      }}>
                      <div style={{
                        width:20, height:20, borderRadius:4, flexShrink:0,
                        background:'var(--bg2)', border:'1px solid var(--text3)',
                      }} />
                      <div style={{ flex:1, fontSize:14, color:'var(--text2)' }}>
                        {m.profiles?.full_name}
                        {m.is_guest && <span style={{ fontStyle:'italic', fontSize:13 }}> (guest)</span>}
                      </div>
                      <span style={{ fontSize:11, color:'var(--accent)' }}>+ add</span>
                    </div>
                  ))}
                </div>
              )}

              {sessionMode === 'free' ? (
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }}
                  onClick={startSessionWithRotation}>
                  ▶ Start Free Play {selectedPlayerIds.length > 0 ? `· ${selectedPlayerIds.length} available` : ''}
                </button>
              ) : (
                <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }}
                  disabled={selectedPlayerIds.length < (modalMatchType === 'doubles' ? 4 : 2)}
                  onClick={startSessionWithRotation}>
                  ▶ Start with Auto Schedule
                </button>
              )}
              <button className="btn btn-ghost" style={{ width:'100%' }} onClick={() => setShowStartModal(false)}>
                Cancel
              </button>
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
                setNotifStatus(Notification.permission)
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
                  <select value={row.h} onChange={e => row.setH(e.target.value)}
                    style={{ width:56, padding:'8px 6px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', fontSize:14, fontFamily:"'Inter',sans-serif", flexShrink:0 }}>
                    <option value="">--</option>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <select value={row.m} onChange={e => row.setM(e.target.value)} style={{
                    flex:'0 0 auto', width:56, padding:'8px 4px', borderRadius:'var(--radius-sm)',
                    background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)',
                    fontSize:13, textAlign:'center', cursor:'pointer',
                  }}>
                    <option value="00">:00</option>
                    <option value="30">:30</option>
                  </select>
                  <div style={{ display:'flex', borderRadius:'var(--radius-sm)', overflow:'hidden', border:'1px solid var(--border)' }}>
                    {['AM','PM'].map(ap => (
                      <button key={ap} type="button" onClick={() => row.setAP(ap)} style={{
                        padding:'8px 10px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                        fontFamily:"'Inter',sans-serif",
                        background: row.ap === ap ? 'var(--accent)' : 'transparent',
                        color: row.ap === ap ? '#fff' : 'var(--text2)',
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
                    onChange={e => {
                      const n = [...customPollOptions]; n[idx] = e.target.value; setCustomPollOptions(n)
                    }}
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
