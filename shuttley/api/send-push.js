import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import apn from '@parse/node-apn'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const APNS_KEY_ID = process.env.APNS_KEY_ID
const APNS_TEAM_ID = process.env.APNS_TEAM_ID
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'club.shuttley'
const APNS_PRIVATE_KEY = (process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const APNS_SANDBOX = process.env.APNS_SANDBOX === 'true'

function getAPNProvider() {
  // node-apn expects a file path — write key to a temp file
  const keyPath = join(tmpdir(), `apns_${APNS_KEY_ID}.p8`)
  writeFileSync(keyPath, APNS_PRIVATE_KEY)
  return new apn.Provider({
    token: {
      key: keyPath,
      keyId: APNS_KEY_ID,
      teamId: APNS_TEAM_ID,
    },
    production: !APNS_SANDBOX,
  })
}

async function sendAPNs(token, title, body, url) {
  try {
    const provider = getAPNProvider()
    const note = new apn.Notification()
    note.alert = { title, body }
    note.sound = 'default'
    note.badge = 1
    note.topic = APNS_BUNDLE_ID
    note.payload = { url }
    const result = await provider.send(note, token)
    return result.sent.length > 0
  } catch (e) {
    console.error('[APNs] error:', e.message)
    return false
  }
}

async function filterEligibleUserIds(supabase, userIds, notificationType) {
  if (notificationType !== 'session_poll') return userIds

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('user_id, session_poll_notifications')
    .in('user_id', userIds)

  if (error) {
    console.error('[Push] preference filter failed, sending to all:', error.message)
    return userIds
  }

  const disabled = new Set(
    (data || [])
      .filter(row => row.session_poll_notifications === false)
      .map(row => row.user_id)
  )
  return userIds.filter(id => !disabled.has(id))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { user_ids, title, body, url = '/', notification_type } = req.body
  if (!user_ids?.length) return res.json({ ok: true, sent: 0, requested: 0, eligible: 0 })

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const eligibleUserIds = await filterEligibleUserIds(supabase, user_ids, notification_type)
  if (!eligibleUserIds.length) {
    return res.json({ ok: true, sent: 0, web: 0, ios: 0, requested: user_ids.length, eligible: 0 })
  }

  // Send web push (VAPID)
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .in('user_id', eligibleUserIds)

  let webSent = 0
  if (subs?.length) {
    const results = await Promise.allSettled(
      subs.map(row =>
        webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url }))
      )
    )
    const deadIds = []
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const code = r.reason?.statusCode
        if (code === 410 || code === 404) deadIds.push(subs[i].id)
      } else {
        webSent++
      }
    })
    if (deadIds.length) {
      await supabase.from('push_subscriptions').delete().in('id', deadIds)
    }
  }

  // Send APNs (iOS)
  let iosSent = 0
  if (APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY) {
    const { data: apnsTokens } = await supabase
      .from('apns_tokens')
      .select('id, token')
      .in('user_id', eligibleUserIds)

    if (apnsTokens?.length) {
      const deadIds = []
      for (const row of apnsTokens) {
        const ok = await sendAPNs(row.token, title, body, url)
        if (ok) {
          iosSent++
        }
      }
      if (deadIds.length) {
        await supabase.from('apns_tokens').delete().in('id', deadIds)
      }
    }
  }

  console.log(`[Push] web: ${webSent}, ios: ${iosSent}`)
  res.json({ ok: true, sent: webSent + iosSent, web: webSent, ios: iosSent, requested: user_ids.length, eligible: eligibleUserIds.length })
}
