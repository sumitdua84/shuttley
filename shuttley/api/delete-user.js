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

    const cleanups = [
      ['poll_responses',    admin.from('poll_responses').delete().eq('user_id', userId)],
      ['chat_members',      admin.from('chat_members').delete().eq('user_id', userId)],
      ['chat_messages',     admin.from('chat_messages').delete().eq('sender_id', userId)],
      ['match_players',     admin.from('match_players').delete().eq('user_id', userId)],
      ['memberships',       admin.from('memberships').delete().eq('user_id', userId)],
      ['splits_participants',admin.from('splits_participants').delete().eq('user_id', userId)],
      ['splits_expenses_paid', admin.from('splits_expenses').delete().eq('paid_by', userId)],
      ['splits_expenses_created', admin.from('splits_expenses').delete().eq('created_by', userId)],
      ['session_polls',     admin.from('session_polls').delete().eq('created_by', userId)],
      ['rotation_matches',  admin.from('rotation_matches').delete().eq('created_by', userId)],
      ['match_edit_log',    admin.from('match_edit_log').delete().eq('user_id', userId)],
      ['matches_recorded',  admin.from('matches').update({ recorded_by: null }).eq('recorded_by', userId)],
      ['matches_confirmed', admin.from('matches').update({ confirmed_by: null }).eq('confirmed_by', userId)],
      ['sessions_started',  admin.from('sessions').update({ started_by: null }).eq('started_by', userId)],
      ['profiles',          admin.from('profiles').delete().eq('id', userId)],
    ]

    for (const [name, query] of cleanups) {
      const { error: e } = await query
      console.log(`[delete-user] ${name}:`, e?.message || 'ok')
    }

    console.log('[delete-user] deleting auth user...')
    const { data: existingUser } = await admin.auth.admin.getUserById(userId)
    if (!existingUser?.user) {
      console.log('[delete-user] auth user already deleted, skipping')
    } else {
      const { error } = await admin.auth.admin.deleteUser(userId)
      console.log('[delete-user] auth delete result:', error?.message || 'ok')
      if (error) return res.status(500).json({ error: `Auth delete failed: ${error.message}` })
    }

    // Mark request as completed
    if (requestId) {
      await admin.from('account_deletion_requests').update({ status: 'completed' }).eq('id', requestId)
    }

    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
