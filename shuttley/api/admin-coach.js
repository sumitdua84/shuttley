import { createClient } from '@supabase/supabase-js'

const SUPER_ADMINS = ['sumit@shuttley.club', 'sumitdua84@gmail.com']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })

  let email
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    email = payload.email
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
  if (!SUPER_ADMINS.includes(email)) return res.status(403).json({ error: 'Forbidden' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const { action, enabled, userId } = body || {}

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Toggle global coach on/off
  if (action === 'global') {
    const { error } = await admin
      .from('app_settings')
      .upsert({ key: 'coach_enabled', value: enabled ? 'true' : 'false' }, { onConflict: 'key' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  // Toggle coach for a specific user
  if (action === 'user' && userId) {
    const { error } = await admin
      .from('profiles')
      .update({ coach_enabled: !!enabled })
      .eq('id', userId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
