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

  const { userId, requestId } = req.body
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return res.status(500).json({ error: error.message })

  if (requestId) {
    await admin.from('account_deletion_requests').update({ status: 'completed' }).eq('id', requestId)
  }

  return res.status(200).json({ success: true })
}
