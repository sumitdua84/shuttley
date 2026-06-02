import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/** Store APNs token from iOS native bridge into Supabase */
async function storeAPNsToken(userId, token) {
  if (!token || !userId) return
  const { data, error } = await supabase.from('apns_tokens').upsert(
    { user_id: userId, token },
    { onConflict: 'user_id' }
  )
  if (error) console.error('[APNs] storeAPNsToken error:', error.message)
  return { data, error }
}

export function usePushNotifications() {
  /** Ask permission + subscribe, store in DB. Returns true if successful. */
  async function subscribe(userId) {
    const isIOSApp = /PWAShell/.test(navigator.userAgent)
    if (isIOSApp) {
      // On iOS, request native push permission — token comes back via 'push-token' event
      window.webkit?.messageHandlers?.['push-permission-request']?.postMessage(null)
      return true
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidKey) return false
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false

      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const subJson = sub.toJSON()
      await supabase.from('push_subscriptions').upsert(
        { user_id: userId, endpoint: subJson.endpoint, subscription: subJson },
        { onConflict: 'user_id,endpoint' }
      )
      return true
    } catch (e) {
      console.error('Push subscribe error:', e)
      return false
    }
  }

  /** Send a push notification to one or more users via the Vercel API route. */
  async function sendPush(userIds, title, body, url = '/') {
    try {
      const res = await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds, title, body, url }),
      })
      const json = await res.json().catch(() => null)
      console.error('[Push] status', res.status, json)
      return json
    } catch (e) {
      console.error('[Push] Send error:', e)
    }
  }

  return { subscribe, sendPush, storeAPNsToken }
}

/** Call this once at app root level to wire up the iOS push-token bridge */
export function useIOSPushTokenBridge(userId) {
  useEffect(() => {
    if (!/PWAShell/.test(navigator.userAgent) || !userId) return
    const handler = async (e) => {
      const token = e.detail
      if (token && !token.startsWith('ERROR')) {
        await storeAPNsToken(userId, token)
      }
    }
    window.addEventListener('push-token', handler)
    window.webkit?.messageHandlers?.['push-token']?.postMessage(null)
    return () => window.removeEventListener('push-token', handler)
  }, [userId])
}
