import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useCoach() {
  const { user } = useAuth()
  const [isOpen, setIsOpen]           = useState(false)
  const [messages, setMessages]       = useState([]) // { role: 'user'|'assistant', content: string }
  const [isThinking, setIsThinking]   = useState(false)
  const [coachEnabled, setCoachEnabled] = useState(false)
  const [error, setError]             = useState(null)

  useEffect(() => {
    if (!user) { setCoachEnabled(false); return }
    checkCoachEnabled()
  }, [user])

  async function checkCoachEnabled() {
    const { data } = await supabase
      .from('profiles')
      .select('coach_enabled')
      .eq('id', user.id)
      .single()
    setCoachEnabled(!!data?.coach_enabled)
  }

  async function openCoach() {
    if (!coachEnabled) return
    setIsOpen(true)
    if (messages.length === 0) {
      // Greet the user on first open
      await callCoach([{ role: 'user', content: 'Hey coach!' }], true)
    }
  }

  function closeCoach() {
    setIsOpen(false)
    setMessages([])
    setError(null)
  }

  async function sendMessage(text) {
    if (!text.trim() || isThinking) return
    const updated = [...messages, { role: 'user', content: text }]
    setMessages(updated)
    await callCoach(updated, false)
  }

  async function callCoach(msgs, isGreeting) {
    setIsThinking(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: msgs.slice(-10) }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Coach unavailable')

      if (isGreeting) {
        // Replace the silent 'Hey coach!' with the real greeting reply
        setMessages([{ role: 'assistant', content: data.message }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      }
    } catch (e) {
      console.error('[useCoach] error:', e.message)
      setError('Coach is unavailable right now. Try again.')
      if (!isGreeting) {
        // Roll back the user message that failed
        setMessages(prev => prev.slice(0, -1))
      }
    } finally {
      setIsThinking(false)
    }
  }

  return {
    isOpen,
    openCoach,
    closeCoach,
    messages,
    isThinking,
    coachEnabled,
    sendMessage,
    error,
  }
}
