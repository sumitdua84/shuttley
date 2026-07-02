import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { usePushNotifications } from '../hooks/usePushNotifications'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

function Avatar({ src, name, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--accent-dim)', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: 'var(--accent)',
    }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (name || '?')[0].toUpperCase()
      }
    </div>
  )
}

function fmtMsgTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function GlobalDMPage() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { sendPush } = usePushNotifications()

  // contact info may be passed via nav state from GlobalChatPage
  const navContact = location.state?.contact

  const [conv, setConv] = useState(null)
  const [otherUser, setOtherUser] = useState(navContact || null)
  const [sharedClubs, setSharedClubs] = useState(navContact?.sharedClubs || [])
  const [myProfile, setMyProfile] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const endRef = useRef(null)
  const channelRef = useRef(null)
  const inputRef = useRef(null)

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    if (!user || !conversationId) return
    boot()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [user, conversationId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function boot() {
    // Load my profile
    const { data: p } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
    setMyProfile(p)

    // Load conversation
    const { data: c } = await supabase.from('chat_conversations')
      .select('id, club_id, type').eq('id', conversationId).maybeSingle()
    if (!c || c.type !== 'dm') { setLoading(false); return }
    setConv(c)

    // Find the other member
    const { data: members } = await supabase.from('chat_members')
      .select('user_id').eq('conversation_id', conversationId)
    const otherId = members?.find(m => m.user_id !== user.id)?.user_id
    if (otherId && !navContact) {
      const { data: op } = await supabase.from('profiles')
        .select('id, full_name, avatar_url').eq('id', otherId).single()
      if (op) setOtherUser(op)

      // Find shared clubs between current user and other user
      const { data: myMems } = await supabase.from('memberships')
        .select('club_id, clubs(name)').eq('user_id', user.id).eq('status', 'approved')
      const myClubIds = (myMems || []).map(m => m.club_id)
      const { data: theirMems } = await supabase.from('memberships')
        .select('club_id').eq('user_id', otherId).eq('status', 'approved')
      const theirClubIds = new Set((theirMems || []).map(m => m.club_id))
      const shared = (myMems || []).filter(m => theirClubIds.has(m.club_id))
        .map(m => ({ id: m.club_id, name: m.clubs?.name }))
      setSharedClubs(shared)
    }

    // Load messages
    const { data: msgs } = await supabase.from('chat_messages')
      .select('*, profiles(full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300)
    setMessages(msgs || [])
    setLoading(false)

    // Subscribe to new messages
    channelRef.current = supabase.channel(`gdm:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async payload => {
        if (payload.new.sender_id === user.id) return
        const { data: sp } = await supabase.from('profiles')
          .select('full_name, avatar_url').eq('id', payload.new.sender_id).single()
        setMessages(prev => [...prev, { ...payload.new, profiles: sp }])
      })
      .subscribe()
  }

  async function send() {
    if (!inputText.trim() || !conv || sending) return
    const content = inputText.trim()
    setInputText('')
    setSending(true)

    const { data: msg, error } = await supabase.from('chat_messages')
      .insert({ conversation_id: conv.id, club_id: conv.club_id, sender_id: user.id, content })
      .select().single()

    if (error) {
      flash('Message failed to send')
      setInputText(content)
      setSending(false)
      return
    }

    if (msg) {
      setMessages(prev => [...prev, { ...msg, profiles: myProfile }])
      await supabase.from('chat_conversations')
        .update({ last_message_at: msg.created_at, last_message_preview: content.slice(0, 60) })
        .eq('id', conv.id)

      // Push notification to recipient
      try {
        const { data: convMembers } = await supabase.from('chat_members')
          .select('user_id').eq('conversation_id', conv.id)
        const recipientIds = (convMembers || []).map(m => m.user_id).filter(id => id !== user.id)
        if (recipientIds.length > 0) {
          const senderName = myProfile?.full_name?.split(' ')[0] || 'Someone'
          sendPush(recipientIds, senderName, content.slice(0, 100), `/chat/${conv.id}`)
        }
      } catch (e) {
        console.warn('[gdm] push failed:', e)
      }
    }

    setSending(false)
    inputRef.current?.focus()
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const sharedLabel = sharedClubs.map(c => c.name).filter(Boolean).join(' · ')

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="topnav" style={{ gap: 10 }}>
        <button
          onClick={() => navigate('/chat')}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}>
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {otherUser?.full_name || 'Message'}
          </div>
          {sharedLabel ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sharedLabel}
            </div>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 8 }}>
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, paddingTop: 20 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, paddingTop: 20, textAlign: 'center' }}>
            Say hi to {otherUser?.full_name?.split(' ')[0] || 'them'} 👋
          </div>
        ) : messages.map((msg, idx) => {
          const mine = msg.sender_id === user.id
          const prevMine = idx > 0 && messages[idx - 1].sender_id === user.id
          const showAvatar = !mine && msg.sender_id !== messages[idx - 1]?.sender_id
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4, marginTop: (mine !== prevMine || idx === 0) ? 12 : 0 }}>
              {!mine && (
                <div style={{ width: 28, flexShrink: 0 }}>
                  {showAvatar && <Avatar src={msg.profiles?.avatar_url} name={msg.profiles?.full_name} size={28} />}
                </div>
              )}
              <div style={{ maxWidth: '72%' }}>
                <div style={{
                  background: mine ? 'var(--accent)' : 'var(--bg2)',
                  color: mine ? '#fff' : 'var(--text)',
                  borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '8px 12px',
                  fontSize: 14, lineHeight: 1.5,
                  border: mine ? 'none' : '0.5px solid var(--border)',
                }}>
                  {msg.content}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
                  {fmtMsgTime(msg.created_at)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px 12px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--bg)' }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Message…"
          style={{
            flex: 1, borderRadius: 20, border: '0.5px solid var(--border)',
            background: 'var(--bg2)', color: 'var(--text)',
            padding: '10px 14px', fontSize: 14, resize: 'none',
            lineHeight: 1.4, maxHeight: 100, overflowY: 'auto',
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={!inputText.trim() || sending}
          style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: inputText.trim() ? 'var(--accent)' : 'var(--bg3)',
            border: 'none', cursor: inputText.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={inputText.trim() ? '#fff' : 'var(--text3)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13"/>
            <path d="M22 2L15 22l-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>

      <Toast message={toast} />
      <BottomNav activeTab="chat" />
    </div>
  )
}
