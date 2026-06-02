function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

// Build play-count map from a set of matches
function playCountsFrom(matches) {
  const plays = {}
  for (const m of matches)
    for (const p of [m.p1, m.p2, m.p3, m.p4].filter(Boolean))
      plays[p] = (plays[p] || 0) + 1
  return plays
}

// Reorder matches so most-rested players go first AND partnerships are varied.
// Priority 1 (dominant): rest equality — minimise total play-count of the 4 players chosen.
// Priority 2 (tie-break): partner variety — penalise reusing the same partnership.
function reorderForRest(matches, initialPlays = {}) {
  const result = []
  const remaining = [...matches]
  const plays = { ...initialPlays }
  const partners = {} // pairKey → times paired together so far
  while (remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i]
      const players = [m.p1, m.p2, m.p3, m.p4].filter(Boolean)
      // Rest score: prefer matches where players have played least (×10 weight = dominant)
      const restScore = -(players.reduce((s, p) => s + (plays[p] || 0), 0)) * 10
      // Partner penalty: penalise repeated partnerships (×3 weight = tie-break only)
      const pk1 = (m.p1 && m.p2) ? pairKey(m.p1, m.p2) : null
      const pk2 = (m.p3 && m.p4) ? pairKey(m.p3, m.p4) : null
      const partnerPenalty = ((pk1 ? (partners[pk1] || 0) : 0) + (pk2 ? (partners[pk2] || 0) : 0)) * 3
      const score = restScore - partnerPenalty
      if (score > bestScore) { bestScore = score; bestIdx = i }
    }
    const [m] = remaining.splice(bestIdx, 1)
    result.push(m)
    for (const p of [m.p1, m.p2, m.p3, m.p4].filter(Boolean)) plays[p] = (plays[p] || 0) + 1
    if (m.p1 && m.p2) { const k = pairKey(m.p1, m.p2); partners[k] = (partners[k] || 0) + 1 }
    if (m.p3 && m.p4) { const k = pairKey(m.p3, m.p4); partners[k] = (partners[k] || 0) + 1 }
  }
  return result
}

// ─── All-combinations generator (4–5 players) ────────────────────────────────
// Enumerates every unique doubles match combination — C(N,4) × 3 —
// then reorders for fairest rest distribution.
// 4 players → 3 combinations; 5 players → 15 combinations.

function generateAllDoublesMatches(players) {
  const n = players.length
  const all = []
  for (let i = 0; i < n - 3; i++)
    for (let j = i + 1; j < n - 2; j++)
      for (let k = j + 1; k < n - 1; k++)
        for (let l = k + 1; l < n; l++) {
          const g = [players[i], players[j], players[k], players[l]]
          all.push({ p1: g[0], p2: g[1], p3: g[2], p4: g[3] })
          all.push({ p1: g[0], p2: g[2], p3: g[1], p4: g[3] })
          all.push({ p1: g[0], p2: g[3], p3: g[1], p4: g[2] })
        }
  return reorderForRest(all)
}

// ─── Unified doubles generator (6+ players) ──────────────────────────────────
// Runs a single greedy loop that covers all opponent pairs AND keeps going until
// every player has an equal play count (max === min).  For N players this
// naturally yields N matches with each player playing N-1 times — rests are
// spread evenly from the start rather than tacked on as an afterthought.
// Pass initialUncovered to seed with a pre-built pair set (used by rebalance).

function generateDoublesMatches(players, initialPlays = {}, initialUncovered = null) {
  const plays = { ...initialPlays }
  const partnerPlays = {}
  const matches = []
  const n = players.length

  // Build (or reuse) the set of opponent pairs still to cover
  const uncovered = initialUncovered instanceof Set
    ? new Set(initialUncovered) // clone so callers aren't mutated
    : new Set()
  if (!initialUncovered) {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        uncovered.add(pairKey(players[i], players[j]))
  }

  const safety = n * n // generous upper bound
  let iter = 0

  while (iter++ < safety) {
    // Stopping condition: all pairs covered AND play counts perfectly equal
    const vals = players.map(p => plays[p] || 0)
    const maxP = Math.max(...vals)
    const minP = Math.min(...vals)
    if (uncovered.size === 0 && maxP === minP) break

    // Find the best next match
    let best = null, bestScore = -Infinity
    for (let i = 0; i < n - 3; i++)
      for (let j = i + 1; j < n - 2; j++)
        for (let k = j + 1; k < n - 1; k++)
          for (let l = k + 1; l < n; l++) {
            const g = [players[i], players[j], players[k], players[l]]
            for (const s of [
              { p1: g[0], p2: g[1], p3: g[2], p4: g[3] },
              { p1: g[0], p2: g[2], p3: g[1], p4: g[3] },
              { p1: g[0], p2: g[3], p3: g[1], p4: g[2] },
            ]) {
              const ps = [s.p1, s.p2, s.p3, s.p4]

              let newPairs = 0
              for (const a of [s.p1, s.p2])
                for (const b of [s.p3, s.p4])
                  if (uncovered.has(pairKey(a, b))) newPairs++

              // Once coverage is done, only consider matches that bring lagging players up
              if (uncovered.size === 0 && !ps.some(p => (plays[p] || 0) < maxP)) continue

              const restBonus = -(ps.reduce((sum, p) => sum + (plays[p] || 0), 0))
              const partnerPenalty = -((partnerPlays[pairKey(s.p1, s.p2)] || 0) + (partnerPlays[pairKey(s.p3, s.p4)] || 0)) * 3
              // Bonus for lifting players who are below the current max
              const balanceBonus = ps.filter(p => (plays[p] || 0) < maxP).length * 5
              const score = newPairs * 10 + restBonus + partnerPenalty + balanceBonus

              if (score > bestScore) { bestScore = score; best = s }
            }
          }

    if (!best) break
    matches.push(best)
    for (const a of [best.p1, best.p2])
      for (const b of [best.p3, best.p4])
        uncovered.delete(pairKey(a, b))
    for (const p of [best.p1, best.p2, best.p3, best.p4]) plays[p] = (plays[p] || 0) + 1
    const pk1 = pairKey(best.p1, best.p2), pk2 = pairKey(best.p3, best.p4)
    partnerPlays[pk1] = (partnerPlays[pk1] || 0) + 1
    partnerPlays[pk2] = (partnerPlays[pk2] || 0) + 1
  }

  return reorderForRest(matches, initialPlays)
}

// ─── Legacy helpers (used by rebalance + new-player paths) ───────────────────

function pickBestDoubles(players, uncovered, plays, partnerPlays) {
  let best = null, bestScore = -Infinity
  const n = players.length
  for (let i = 0; i < n - 3; i++)
    for (let j = i + 1; j < n - 2; j++)
      for (let k = j + 1; k < n - 1; k++)
        for (let l = k + 1; l < n; l++) {
          const g = [players[i], players[j], players[k], players[l]]
          for (const s of [
            { p1: g[0], p2: g[1], p3: g[2], p4: g[3] },
            { p1: g[0], p2: g[2], p3: g[1], p4: g[3] },
            { p1: g[0], p2: g[3], p3: g[1], p4: g[2] },
          ]) {
            let newPairs = 0
            for (const a of [s.p1, s.p2])
              for (const b of [s.p3, s.p4])
                if (uncovered.has(pairKey(a, b))) newPairs++
            if (newPairs === 0) continue
            const restBonus = -([s.p1, s.p2, s.p3, s.p4].reduce((sum, p) => sum + (plays[p] || 0), 0))
            const partnerPenalty = -((partnerPlays[pairKey(s.p1, s.p2)] || 0) + (partnerPlays[pairKey(s.p3, s.p4)] || 0)) * 3
            const score = newPairs * 10 + restBonus + partnerPenalty
            if (score > bestScore) { bestScore = score; best = s }
          }
        }
  return best
}

function runDoublesGreedy(players, uncoveredPairs, initialPlays = {}) {
  const plays = { ...initialPlays }
  const partnerPlays = {}
  const matches = []
  let safety = uncoveredPairs.size * 4
  while (uncoveredPairs.size > 0 && safety-- > 0) {
    const best = pickBestDoubles(players, uncoveredPairs, plays, partnerPlays)
    if (!best) break
    matches.push(best)
    for (const a of [best.p1, best.p2])
      for (const b of [best.p3, best.p4])
        uncoveredPairs.delete(pairKey(a, b))
    for (const p of [best.p1, best.p2, best.p3, best.p4]) plays[p] = (plays[p] || 0) + 1
    const pk1 = pairKey(best.p1, best.p2), pk2 = pairKey(best.p3, best.p4)
    partnerPlays[pk1] = (partnerPlays[pk1] || 0) + 1
    partnerPlays[pk2] = (partnerPlays[pk2] || 0) + 1
  }
  return matches
}

function addBalancingMatches(players, type, existingMatches) {
  const plays = playCountsFrom(existingMatches)
  for (const p of players) if (plays[p] === undefined) plays[p] = 0

  const targetMin = Math.max(...players.map(p => plays[p]))
  if (targetMin === 0) return []

  const partnerPlays = {}
  for (const m of existingMatches) {
    if (m.p1 && m.p2) { const k = pairKey(m.p1, m.p2); partnerPlays[k] = (partnerPlays[k] || 0) + 1 }
    if (m.p3 && m.p4) { const k = pairKey(m.p3, m.p4); partnerPlays[k] = (partnerPlays[k] || 0) + 1 }
  }

  const extra = []
  let safety = players.length * 3

  while (safety-- > 0) {
    if (players.every(p => plays[p] >= targetMin)) break

    if (type === 'singles' || players.length < 4) {
      const sorted = [...players].sort((a, b) => plays[a] - plays[b])
      extra.push({ p1: sorted[0], p2: null, p3: sorted[1], p4: null })
      plays[sorted[0]]++; plays[sorted[1]]++
    } else {
      const sorted = [...players].sort((a, b) => plays[a] - plays[b])
      const group = sorted.slice(0, 4)
      let best = null, bestScore = -Infinity
      for (const s of [
        { p1: group[0], p2: group[1], p3: group[2], p4: group[3] },
        { p1: group[0], p2: group[2], p3: group[1], p4: group[3] },
        { p1: group[0], p2: group[3], p3: group[1], p4: group[2] },
      ]) {
        const belowTarget = [s.p1, s.p2, s.p3, s.p4].filter(p => plays[p] < targetMin).length
        const penalty = (partnerPlays[pairKey(s.p1, s.p2)] || 0) + (partnerPlays[pairKey(s.p3, s.p4)] || 0)
        const score = belowTarget * 10 - penalty * 3
        if (score > bestScore) { bestScore = score; best = s }
      }
      if (!best) break
      extra.push(best)
      for (const p of [best.p1, best.p2, best.p3, best.p4]) plays[p]++
      const pk1 = pairKey(best.p1, best.p2), pk2 = pairKey(best.p3, best.p4)
      partnerPlays[pk1] = (partnerPlays[pk1] || 0) + 1
      partnerPlays[pk2] = (partnerPlays[pk2] || 0) + 1
    }
  }
  return extra
}

// ─── Public API ───────────────────────────────────────────────────────────────

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b) }

// How many matches form one complete rest-rotation cycle for N players
// (the smallest K where every player has rested the same number of times)
// n=5 → 5, n=6 → 3, n=7 → 7, n=8 → 2
function roundSize(n) { return n / gcd(n - 4, n) }

// Given 4 players, pick the split (A+B vs C+D) that:
//   1. Uses the least-used grouping for this specific set of 4 (primary)
//   2. Has the lowest total partnership repeat count (tie-break)
// groupPairings tracks how many times each of the 3 splits has been used per group.
function bestPairing(players, partners, groupPairings) {
  const groupKey = [...players].sort().join('|')
  const [a, b, c, d] = players
  const options = [
    { p1: a, p2: b, p3: c, p4: d },
    { p1: a, p2: c, p3: b, p4: d },
    { p1: a, p2: d, p3: b, p4: c },
  ]
  if (!groupPairings[groupKey]) groupPairings[groupKey] = [0, 0, 0]
  const gp = groupPairings[groupKey]
  let bestIdx = 0, bestScore = Infinity
  for (let i = 0; i < 3; i++) {
    const opt = options[i]
    // group-level usage (×100) dominates; partnership repeat count breaks ties
    const score = gp[i] * 100 +
      (partners[pairKey(opt.p1, opt.p2)] || 0) +
      (partners[pairKey(opt.p3, opt.p4)] || 0)
    if (score < bestScore) { bestScore = score; bestIdx = i }
  }
  gp[bestIdx]++
  return options[bestIdx]
}

// Full schedule — queue-based strict rest rotation + best pairing:
//   • Each match the next N-4 players in the queue sit out (strict rotation)
//   • For the 4 playing, pick the split that cycles all 3 pairings of
//     each group evenly before repeating any pairing
//   • Singles / <4 players → every head-to-head pair
//   • 4 players → 3 unique pairings (1 cycle)
//   • 5 players → 15 matches (3 complete cycles, all combinations)
//   • 6–8 players → ~15 matches in complete rotation rounds
export function generateSchedule(playerIds, type) {
  if (!playerIds || playerIds.length < 2) return []

  if (type === 'singles' || playerIds.length < 4) {
    const raw = []
    for (let i = 0; i < playerIds.length; i++)
      for (let j = i + 1; j < playerIds.length; j++)
        raw.push({ p1: playerIds[i], p2: null, p3: playerIds[j], p4: null })
    return raw
  }

  const n = playerIds.length
  const sitOut = n - 4

  // Exactly 4 players: one set of all 3 unique pairings
  if (sitOut === 0) {
    const partners = {}, groupPairings = {}
    return [
      bestPairing(playerIds, partners, groupPairings),
      bestPairing(playerIds, partners, groupPairings),
      bestPairing(playerIds, partners, groupPairings),
    ]
  }

  // 5–8 players: strict queue rotation
  const partners = {}, groupPairings = {}
  const queue = [...playerIds]          // rest rotation queue
  const rs = roundSize(n)               // matches per complete rotation cycle
  const target = Math.ceil(15 / rs) * rs // ~15 matches, always complete cycles

  const matches = []
  for (let i = 0; i < target; i++) {
    // Next sitOut players in the queue sit out this match
    const resting = queue.splice(0, sitOut)
    // Remaining 4 players (in original playerIds order)
    const playing = playerIds.filter(p => !resting.includes(p))
    const match = bestPairing(playing, partners, groupPairings)
    matches.push(match)
    // Record partnerships used
    if (match.p2) { const k = pairKey(match.p1, match.p2); partners[k] = (partners[k] || 0) + 1 }
    if (match.p4) { const k = pairKey(match.p3, match.p4); partners[k] = (partners[k] || 0) + 1 }
    // Resting players go to the back of the queue
    queue.push(...resting)
    // After each complete rotation cycle, shift queue by 1 to break fixed rest pairs
    // e.g. 6 players: AB/CD/EF → FA/BC/DE → EF/AB/CD → ... (covers all adjacent pairs)
    if (sitOut > 1 && (i + 1) % rs === 0 && i + 1 < target) {
      const shifted = queue.pop()
      queue.unshift(shifted)
    }
  }
  return matches
}

// Rebalance: generate schedule for remaining players, skipping already-played pairs
export function generateRebalancedSchedule(playerIds, type, submittedMatches) {
  if (!playerIds || playerIds.length < 2) return []

  const playerSet = new Set(playerIds)
  const coveredPairs = new Set()
  for (const m of submittedMatches) {
    for (const a of [m.p1, m.p2].filter(Boolean))
      for (const b of [m.p3, m.p4].filter(Boolean))
        if (playerSet.has(a) && playerSet.has(b))
          coveredPairs.add(pairKey(a, b))
  }

  const initialPlays = playCountsFrom(submittedMatches)

  if (type === 'singles' || playerIds.length < 4) {
    const raw = []
    for (let i = 0; i < playerIds.length; i++)
      for (let j = i + 1; j < playerIds.length; j++)
        if (!coveredPairs.has(pairKey(playerIds[i], playerIds[j])))
          raw.push({ p1: playerIds[i], p2: null, p3: playerIds[j], p4: null })
    const coverage = reorderForRest(raw, initialPlays)
    const balance = addBalancingMatches(playerIds, type, [...submittedMatches, ...coverage])
    return [...coverage, ...balance]
  }

  // Build the set of pairs not yet played
  const uncovered = new Set()
  for (let i = 0; i < playerIds.length; i++)
    for (let j = i + 1; j < playerIds.length; j++) {
      const key = pairKey(playerIds[i], playerIds[j])
      if (!coveredPairs.has(key)) uncovered.add(key)
    }
  if (uncovered.size === 0) return []

  // Use unified generator seeded with existing play counts + only uncovered pairs
  return generateDoublesMatches(playerIds, initialPlays, uncovered)
}

// Re-sort all pending matches fairly based on current play counts
export function reorderPendingMatches(pendingMatches, submittedMatches) {
  if (pendingMatches.length === 0) return []
  const initialPlays = playCountsFrom(submittedMatches)
  return reorderForRest(pendingMatches, initialPlays)
}

// Generate matches for a player joining mid-session
export function generateMatchesForNewPlayer(newPlayerId, allPlayerIds, existingMatches, type) {
  const scheduledOpponents = new Set()
  for (const m of existingMatches) {
    if (m.status === 'removed') continue
    const t1 = [m.p1, m.p2].filter(Boolean)
    const t2 = [m.p3, m.p4].filter(Boolean)
    if (t1.includes(newPlayerId)) t2.forEach(p => scheduledOpponents.add(p))
    if (t2.includes(newPlayerId)) t1.forEach(p => scheduledOpponents.add(p))
  }

  const others = allPlayerIds.filter(p => p !== newPlayerId)
  const unscheduled = others.filter(p => !scheduledOpponents.has(p))
  if (unscheduled.length === 0) return []

  if (type === 'singles' || allPlayerIds.length < 4) {
    return unscheduled.map(p => ({ p1: newPlayerId, p2: null, p3: p, p4: null }))
  }

  if (others.length < 3) return []
  const uncovered = new Set(unscheduled)
  const partnerPlays = {}
  const plays = playCountsFrom(existingMatches.filter(m => m.status !== 'removed'))
  delete plays[newPlayerId]
  let safety = unscheduled.length * 3

  const matches = []
  while (uncovered.size > 0 && safety-- > 0) {
    let best = null, bestScore = -Infinity
    for (const partner of others) {
      const opps = others.filter(p => p !== partner)
      for (let i = 0; i < opps.length - 1; i++)
        for (let j = i + 1; j < opps.length; j++) {
          const [o1, o2] = [opps[i], opps[j]]
          const newCovered = [o1, o2].filter(o => uncovered.has(o)).length
          if (newCovered === 0) continue
          const pk = pairKey(newPlayerId, partner)
          const score = newCovered * 10 - (partnerPlays[pk] || 0) * 3 - ((plays[partner] || 0) + (plays[o1] || 0) + (plays[o2] || 0))
          if (score > bestScore) { bestScore = score; best = { p1: newPlayerId, p2: partner, p3: o1, p4: o2 } }
        }
    }
    if (!best) break
    matches.push(best)
    for (const o of [best.p3, best.p4]) uncovered.delete(o)
    const pk = pairKey(best.p1, best.p2)
    partnerPlays[pk] = (partnerPlays[pk] || 0) + 1
    for (const p of [best.p2, best.p3, best.p4]) plays[p] = (plays[p] || 0) + 1
  }
  return matches
}
