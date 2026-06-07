import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // 1. Get user JWT
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })

  // 2. Verify JWT via Supabase
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

  // 3. Admin client for DB queries
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // 4. Check global toggle
  const { data: globalSetting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'coach_enabled')
    .single()
  if (globalSetting?.value !== 'true') {
    return res.status(403).json({ error: 'coach_disabled' })
  }

  // 5. Check per-user toggle + get profile name
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, coach_enabled')
    .eq('id', user.id)
    .single()
  if (!profile?.coach_enabled) {
    return res.status(403).json({ error: 'coach_not_enabled' })
  }

  // 6. Parse body
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const { messages } = body || {}
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing messages' })
  }

  // 7. Fetch stats + memories in parallel
  const [stats, memoriesResult] = await Promise.all([
    fetchUserStats(admin, user.id),
    admin.from('coach_memory')
      .select('id, memory_type, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
  ])
  const memories = memoriesResult.data || []

  // 8. Build system prompt + call Claude
  const systemPrompt = buildSystemPrompt(profile.full_name, stats, memories)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages.slice(-10),
    })

    const assistantMessage = response.content[0]?.text || ''

    // 9. Extract memories from latest user message (fire and forget)
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      extractAndSaveMemories(admin, user.id, lastUserMsg.content, memories)
        .catch(e => console.error('[coach] memory save error:', e.message))
    }

    return res.status(200).json({ message: assistantMessage })
  } catch (e) {
    console.error('[coach] Anthropic error:', e.message)
    return res.status(500).json({ error: 'Coach unavailable' })
  }
}

// ─── Stats fetcher ────────────────────────────────────────────────────────────

async function fetchUserStats(admin, userId) {
  // Get all confirmed matches this user played in
  const { data: myMatchPlayers } = await admin
    .from('match_players')
    .select('side, match_id, matches!inner(id, type, team1_score, team2_score, winner_side, status, played_at)')
    .eq('user_id', userId)
    .eq('matches.status', 'confirmed')

  if (!myMatchPlayers || myMatchPlayers.length === 0) {
    const { data: memberships } = await admin
      .from('memberships')
      .select('clubs(name)')
      .eq('user_id', userId)
      .eq('status', 'approved')
    return {
      wins: 0, losses: 0, totalMatches: 0,
      recentWins: 0, recentTotal: 0,
      nemesis: null, victim: null,
      clubNames: (memberships || []).map(m => m.clubs?.name).filter(Boolean)
    }
  }

  const matchIds = myMatchPlayers.map(mp => mp.match_id)

  // Get all opponents in those matches
  const { data: otherPlayers } = await admin
    .from('match_players')
    .select('match_id, user_id, side, profiles(full_name)')
    .in('match_id', matchIds)
    .neq('user_id', userId)

  const others = otherPlayers || []
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)

  let wins = 0, losses = 0, recentWins = 0, recentTotal = 0
  const opponents = {}

  myMatchPlayers.forEach(mp => {
    const match = mp.matches
    if (!match) return
    const won = match.winner_side === mp.side
    if (won) wins++; else losses++

    if (match.played_at && new Date(match.played_at) >= cutoff) {
      recentTotal++
      if (won) recentWins++
    }

    // Track head-to-head vs opponents
    others
      .filter(p => p.match_id === match.id && p.side !== mp.side)
      .forEach(opp => {
        if (!opponents[opp.user_id]) {
          opponents[opp.user_id] = { name: opp.profiles?.full_name || 'Unknown', wins: 0, losses: 0 }
        }
        if (won) opponents[opp.user_id].wins++
        else opponents[opp.user_id].losses++
      })
  })

  const oppList = Object.values(opponents)
  const nemesis = oppList.filter(o => o.losses > 0).sort((a, b) => b.losses - a.losses)[0] || null
  const victim  = oppList.filter(o => o.wins  > 0).sort((a, b) => b.wins  - a.wins )[0] || null

  // Get clubs
  const { data: memberships } = await admin
    .from('memberships')
    .select('clubs(name)')
    .eq('user_id', userId)
    .eq('status', 'approved')
  const clubNames = (memberships || []).map(m => m.clubs?.name).filter(Boolean)

  return { wins, losses, totalMatches: wins + losses, recentWins, recentTotal, nemesis, victim, clubNames }
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(playerName, stats, memories) {
  const { wins, losses, totalMatches, recentWins, recentTotal, nemesis, victim, clubNames } = stats
  const winRate = totalMatches > 0 ? Math.round(wins / totalMatches * 100) : 0

  let statsText = 'PLAYER STATS:\n'
  if (totalMatches > 0) {
    statsText += `- Overall: ${wins}W / ${losses}L (${winRate}% win rate, ${totalMatches} matches total)\n`
  } else {
    statsText += '- No matches recorded yet — they are just getting started\n'
  }
  if (recentTotal > 0) {
    const recentRate = Math.round(recentWins / recentTotal * 100)
    statsText += `- Last 30 days: ${recentWins}W / ${recentTotal - recentWins}L (${recentRate}%)\n`
  }
  if (nemesis) statsText += `- Nemesis: ${nemesis.name} (lost ${nemesis.losses} times against them)\n`
  if (victim && victim.name !== nemesis?.name) {
    statsText += `- Favourite to beat: ${victim.name} (won ${victim.wins} times)\n`
  }
  if (clubNames.length > 0) statsText += `- Club: ${clubNames.join(', ')}\n`

  let memoriesText = ''
  if (memories.length > 0) {
    memoriesText = '\nWHAT YOU KNOW ABOUT THIS PLAYER:\n'
    memories.forEach(m => { memoriesText += `- [${m.memory_type}] ${m.content}\n` })
  }

  return `You are the Shuttley Coach — a warm, encouraging badminton coach for ${playerName || 'this player'}.

${statsText}${memoriesText}
COACHING STYLE:
- Keep responses SHORT (2-4 sentences max)
- Be encouraging but honest — don't sugarcoat
- Reference their actual stats naturally when relevant — never invent numbers
- Ask follow-up questions to understand their game better
- Stay focused on badminton, fitness, tactics, and their improvement
- Never be generic — you know their record and history`
}

// ─── Memory extractor ─────────────────────────────────────────────────────────

async function extractAndSaveMemories(admin, userId, text, existingMemories) {
  const lower = text.toLowerCase()
  const newMemories = []

  // Injury / physical
  if (/\b(knee|shoulder|wrist|ankle|back|elbow|hamstring|injury|injured|sore|pain|hurt|sprain|strain)\b/.test(lower)) {
    const match = text.match(/(?:my\s+)?(\w+(?:\s+\w+)?)\s+(?:is\s+)?(?:sore|hurt|injured|painful?)/i)
    newMemories.push({
      memory_type: 'injury',
      content: match ? `${match[1]} issue mentioned` : 'physical complaint mentioned'
    })
  }

  // Goals
  if (/\b(want to|trying to|working on|improve|get better|practis|learn|focus on)\b/.test(lower)) {
    const match = text.match(/(?:want to|trying to|working on|improve(?:ing)?\s+my?|get better at|focus(?:ing)? on)\s+(?:my\s+)?([^,.!?]{3,40})/i)
    if (match) newMemories.push({ memory_type: 'goal', content: `Goal: ${match[1].trim()}` })
  }

  // Equipment
  if (/\b(racket|racquet|yonex|victor|li.?ning|babolat|shuttle|shoes|grip|string|badminton bag)\b/.test(lower)) {
    const brandMatch = lower.match(/\b(yonex|victor|li-ning|lining|babolat)\b/)
    const typeMatch  = text.match(/(?:using?|bought?|got|have|switched? to)\s+(?:a\s+|an\s+)?([A-Za-z0-9\s]{2,30}(?:racket|racquet|shoe)s?)/i)
    const content    = typeMatch ? typeMatch[1].trim() : brandMatch ? `${brandMatch[0]} gear` : 'new equipment'
    newMemories.push({ memory_type: 'equipment', content })
  }

  // Preferences
  if (/\b(prefer|favourite|love|enjoy|hate|dislike|don.t like)\b/.test(lower)) {
    const match = text.match(/(?:prefer|love|enjoy|favourite|really like)\s+(?:playing\s+)?([^,.!?]{3,35})/i)
    if (match) newMemories.push({ memory_type: 'preference', content: match[1].trim() })
  }

  if (newMemories.length === 0) return

  // Prune oldest if over 20
  const totalAfter = existingMemories.length + newMemories.length
  if (totalAfter > 20) {
    const pruneCount = totalAfter - 20
    const toDelete = existingMemories.slice(-pruneCount).map(m => m.id).filter(Boolean)
    if (toDelete.length > 0) {
      await admin.from('coach_memory').delete().in('id', toDelete)
    }
  }

  await admin.from('coach_memory').insert(newMemories.map(m => ({ user_id: userId, ...m })))
}
