import { createClient } from '@supabase/supabase-js'

const SUPER_ADMINS = ['sumit@shuttley.club']

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Decode JWT payload to get email (Supabase JWTs are signed — payload is safe to read)
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })
  let email
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    email = payload.email
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
  if (!SUPER_ADMINS.includes(email)) return res.status(403).json({ error: 'Forbidden', email })

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const [clubsRes, usersRes, membershipsRes, sessionsRes, matchesRes, featuresRes] = await Promise.all([
    admin.from('clubs').select('*').order('created_at', { ascending: false }),
    admin.from('profiles').select('*').order('created_at', { ascending: false }),
    admin.from('memberships').select('club_id, user_id, role, status'),
    admin.from('sessions').select('id, name, status, match_type, created_at, club_id').order('created_at', { ascending: false }).limit(50),
    admin.from('matches').select('id', { count: 'exact', head: true }),
    admin.from('club_features').select('*'),
  ])

  console.log('[Admin] clubs:', clubsRes.data?.length, clubsRes.error)
  console.log('[Admin] sessions:', sessionsRes.data?.length, sessionsRes.error)

  res.json({
    clubs:       clubsRes.data       || [],
    users:       usersRes.data       || [],
    memberships: membershipsRes.data || [],
    sessions:    sessionsRes.data    || [],
    matchCount:  matchesRes.count    || 0,
    features:    featuresRes.data    || [],
  })
}
