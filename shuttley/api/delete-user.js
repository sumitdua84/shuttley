import { createClient } from '@supabase/supabase-js'
// v2

const SUPER_ADMINS = ['sumit@shuttley.club', 'sumitdua84@gmail.com']

export default async function handler(req, res) {
  console.log('[delete-user] called', req.method)
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
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // 1. Get next sequence value for anonymous name
    const { data: seqVal, error: seqErr } = await admin.rpc('get_next_deleted_seq')
    if (seqErr) {
      console.log('[delete-user] sequence error:', seqErr.message)
      return res.status(500).json({ error: 'Failed to generate anonymised name: ' + seqErr.message })
    }
    const anonName = `deleted_${seqVal}`
    const anonEmail = `${anonName}@deleted.com`
    console.log('[delete-user] anonymised name:', anonName)

    // 2. Anonymise the profile
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      full_name: anonName,
      avatar_url: null,
    })
    if (profileErr) console.log('[delete-user] profile upsert error:', profileErr.message)
    else console.log('[delete-user] profile anonymised')

    // 3. Change auth email + randomise password so they can't log in
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      email: anonEmail,
      password: Math.random().toString(36) + Math.random().toString(36),
      email_confirm: true,
      user_metadata: { full_name: anonName },
    })
    if (authErr) console.log('[delete-user] auth update error:', authErr.message)
    else console.log('[delete-user] auth email changed to', anonEmail)

    // 4. Remove from all clubs
    const { error: memberErr } = await admin.from('memberships').delete().eq('user_id', userId)
    if (memberErr) console.log('[delete-user] memberships remove error:', memberErr.message)
    else console.log('[delete-user] removed from all clubs')

    // 5. Delete chat messages
    const { error: chatErr } = await admin.from('chat_messages').delete().eq('sender_id', userId)
    if (chatErr) console.log('[delete-user] chat_messages delete error:', chatErr.message)
    else console.log('[delete-user] chat messages cleared')

    // 5b. Remove from chat conversation membership (DMs/groups)
    const { error: chatMemberErr } = await admin.from('chat_members').delete().eq('user_id', userId)
    if (chatMemberErr) console.log('[delete-user] chat_members remove error:', chatMemberErr.message)
    else console.log('[delete-user] removed from chat conversations')

    // 6. Mark deletion request as completed
    if (requestId) {
      await admin.from('account_deletion_requests').update({ status: 'completed' }).eq('id', requestId)
    }

    return res.status(200).json({ success: true, anonName })
  } catch (e) {
    console.log('[delete-user] error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
