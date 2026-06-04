import { createClient } from '@supabase/supabase-js'
// v2

const SUPER_ADMINS = ['sumit@shuttley.club', 'sumitdua84@gmail.com']

export default async function handler(req, res) {
  console.log('[delete-user] called', req.method, JSON.stringify(req.body))
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
  const { userId, requestId } = body || {}
  if (!userId) return res.status(400).json({ error: 'Missing userId', body: JSON.stringify(body) })

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    console.log('[delete-user] starting cleanup for', userId)

    const r1 = await admin.from('poll_responses').delete().eq('user_id', userId)
    console.log('[delete-user] poll_responses:', r1.error?.message || 'ok')

    const r2 = await admin.from('chat_members').delete().eq('user_id', userId)
    console.log('[delete-user] chat_members:', r2.error?.message || 'ok')

    const r3 = await admin.from('chat_messages').delete().eq('sender_id', userId)
    console.log('[delete-user] chat_messages:', r3.error?.message || 'ok')

    const r4 = await admin.from('match_players').delete().eq('user_id', userId)
    console.log('[delete-user] match_players:', r4.error?.message || 'ok')

    const r5 = await admin.from('memberships').delete().eq('user_id', userId)
    console.log('[delete-user] memberships:', r5.error?.message || 'ok')

    const r6 = await admin.from('profiles').delete().eq('id', userId)
    console.log('[delete-user] profiles:', r6.error?.message || 'ok')

    console.log('[delete-user] deleting auth user...')
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return res.status(500).json({ error: `Auth delete failed: ${error.message}` })

    // Mark request as completed
    if (requestId) {
      await admin.from('account_deletion_requests').update({ status: 'completed' }).eq('id', requestId)
    }

    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
