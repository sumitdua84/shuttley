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
  const { userId, requestId, anonymisedName } = body || {}
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const anonName = anonymisedName || 'deleted_user'
    const anonEmail = `${anonName}@deleted.com`

    // 1. Anonymise the profile
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      full_name: anonName,
      avatar_url: null,
    })
    if (profileErr) console.log('[delete-user] profile upsert error:', profileErr.message)
    else console.log('[delete-user] profile anonymised')

    // 2. Change auth email so they can't log in
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      email: anonEmail,
      password: Math.random().toString(36) + Math.random().toString(36), // random unrecoverable password
      email_confirm: true,
    })
    if (authErr) console.log('[delete-user] auth update error:', authErr.message)
    else console.log('[delete-user] auth email changed to', anonEmail)

    // 3. Mark deletion request as completed
    if (requestId) {
      await admin.from('account_deletion_requests').update({ status: 'completed' }).eq('id', requestId)
    }

    return res.status(200).json({ success: true })
  } catch (e) {
    console.log('[delete-user] error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
