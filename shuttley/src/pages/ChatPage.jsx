import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { usePushNotifications } from '../hooks/usePushNotifications'
import BottomNav from '../components/BottomNav'

const SUPER_ADMINS = ['sumit@shuttley.club']

function Avatar({ src, name, size = 40, accent = false, emoji = null }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: accent ? 'var(--accent)' : 'var(--bg3)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700,
      color: accent ? '#fff' : 'var(--accent)',
    }}>
      {src
        ? <img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        : emoji || (name || '?')[0].toUpperCase()
      }
    </div>
  )
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-AU', { hour:'numeric', minute:'2-digit', hour12:true })
  const y = new Date(now); y.setDate(now.getDate()-1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { day:'numeric', month:'short' })
}

function fmtMsgTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-AU', { hour:'numeric', minute:'2-digit', hour12:true })
}

export default function ChatPage() {
  const { clubId } = useParams()
  const { user }   = useAuth()
  const navigate   = useNavigate()
  console.log('[ChatPage] mount — clubId:', clubId, 'user:', user?.id)

  const [status, setStatus]           = useState('loading') // 'loading'|'error'|'ready'
  const [errorMsg, setErrorMsg]       = useState('')
  const [club, setClub]               = useState(null)
  const [members, setMembers]         = useState([])
  const [myMem, setMyMem]             = useState(null)
  const [myProfile, setMyProfile]     = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv]   = useState(null)
  const [messages, setMessages]       = useState([])
  const [msgLoading, setMsgLoading]   = useState(false)
  const [inputText, setInputText]     = useState('')
  const [sending, setSending]         = useState(false)
  const [panel, setPanel]             = useState('list')  // mobile: 'list'|'chat'
  const [showNewDM, setShowNewDM]     = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupName, setGroupName]     = useState('')
  const [groupSel, setGroupSel]       = useState([])
  const [creatingGroup, setCreatingGroup] = useState(false)
  // Read state: convId → ISO timestamp of when user last read it
  const readKey = `chat-read:${user?.id}:${clubId}`
  const [readState, setReadState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`chat-read:${user?.id}:${clubId}`) || '{}') }
    catch { return {} }
  })

  const { sendPush } = usePushNotifications()

  const endRef          = useRef(null)
  const channelRef      = useRef(null)   // active conversation messages
  const clubChannelRef  = useRef(null)   // club-wide message previews
  const memberChanRef   = useRef(null)   // new conversations added to me
  const inputRef        = useRef(null)

  // ── read state helpers ───────────────────────────────────────────────────────
  function markRead(convId) {
    const updated = { ...readState, [convId]: new Date().toISOString() }
    setReadState(updated)
    try { localStorage.setItem(readKey, JSON.stringify(updated)) } catch {}
  }
  function isUnread(conv) {
    if (!conv?.last_message_at) return false
    const readAt = readState[conv.id]
    if (!readAt) return !!conv.last_message_preview  // never opened but has messages
    return new Date(conv.last_message_at) > new Date(readAt)
  }

  // ── boot ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setErrorMsg('Timed out — check Supabase SQL setup')
      setStatus('error')
    }, 10000)

    load()
      .then(() => clearTimeout(t))
      .catch(e => {
        clearTimeout(t)
        setErrorMsg(e.message || String(e))
        setStatus('error')
      })

    return () => {
      clearTimeout(t)
      if (channelRef.current)     supabase.removeChannel(channelRef.current)
      if (clubChannelRef.current) supabase.removeChannel(clubChannelRef.current)
      if (memberChanRef.current)  supabase.removeChannel(memberChanRef.current)
    }
  }, [clubId])

  useEffect(() => {
    if (!activeConv) return
    fetchMessages(activeConv.id)
    listenMessages(activeConv.id)
  }, [activeConv?.id])

  useEffect(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior:'smooth' }), 60)
  }, [messages])

  async function load() {
    const [
      { data: clubRow },
      { data: memRow },
      { data: memsRow },
      { data: profRow },
    ] = await Promise.all([
      supabase.from('clubs').select('*').eq('id', clubId).single(),
      supabase.from('memberships').select('*').eq('club_id', clubId).eq('user_id', user.id).single(),
      supabase.from('memberships').select('*, profiles(*)').eq('club_id', clubId).eq('status', 'approved'),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
    ])

    setClub(clubRow)
    setMyMem(memRow)
    setMyProfile(profRow)
    setMembers((memsRow || []).filter(m => !m.is_guest))

    // Ensure club-wide "All Members" conversation exists
    let { data: allConv, error: allConvErr } = await supabase
      .from('chat_conversations').select('*')
      .eq('club_id', clubId).eq('type', 'all').maybeSingle()

    if (allConvErr) console.error('[chat] fetch allConv error:', allConvErr)

    if (!allConv) {
      const { data: c, error: insertErr } = await supabase
        .from('chat_conversations')
        .insert({ club_id: clubId, type:'all', name:'All Members', created_by: user.id })
        .select().single()
      if (insertErr) console.error('[chat] create allConv error:', insertErr)
      allConv = c
    }

    // User's other convs (DMs, groups)
    const { data: mOf } = await supabase
      .from('chat_members').select('conversation_id').eq('user_id', user.id)
    const ids = (mOf || []).map(m => m.conversation_id).filter(id => id !== allConv?.id)

    let others = []
    if (ids.length > 0) {
      const { data: cs } = await supabase
        .from('chat_conversations').select('*').eq('club_id', clubId).in('id', ids)
        .order('last_message_at', { ascending:false, nullsFirst:false })
      others = await Promise.all((cs || []).map(async c => {
        if (c.type !== 'dm') return c
        const { data: o, error: oErr } = await supabase
          .from('chat_members').select('user_id, profiles(full_name, avatar_url)')
          .eq('conversation_id', c.id).neq('user_id', user.id).single()
        if (oErr) console.warn('[chat] otherUser lookup failed for conv', c.id, oErr.message)
        return { ...c, otherUser: o?.profiles, otherUserId: o?.user_id }
      }))
    }

    const all = allConv ? [allConv, ...others] : others
    setConversations(all)
    if (allConv) setActiveConv(allConv)
    setStatus('ready')

    // ── Club-wide realtime: update conversation previews for ANY new message ──
    if (clubChannelRef.current) supabase.removeChannel(clubChannelRef.current)
    clubChannelRef.current = supabase.channel(`club-chat:${clubId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages',
        filter:`club_id=eq.${clubId}` },
        payload => {
          setConversations(prev => prev.map(c =>
            c.id === payload.new.conversation_id
              ? { ...c, last_message_at: payload.new.created_at,
                  last_message_preview: payload.new.content?.slice(0, 60) }
              : c
          ))
        })
      .subscribe()

    // ── New conversation listener: auto-add DMs/groups created by others ──
    if (memberChanRef.current) supabase.removeChannel(memberChanRef.current)
    memberChanRef.current = supabase.channel(`my-convs:${user.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_members',
        filter:`user_id=eq.${user.id}` },
        async payload => {
          const { data: conv } = await supabase
            .from('chat_conversations').select('*')
            .eq('id', payload.new.conversation_id).single()
          if (!conv || conv.club_id !== clubId || conv.type === 'all') return
          setConversations(prev => {
            if (prev.find(c => c.id === conv.id)) return prev
            const enrichAsync = async () => {
              if (conv.type === 'dm') {
                const { data: o } = await supabase
                  .from('chat_members').select('user_id, profiles(full_name, avatar_url)')
                  .eq('conversation_id', conv.id).neq('user_id', user.id).single()
                setConversations(p => p.find(c => c.id === conv.id) ? p : [...p, { ...conv, otherUser: o?.profiles }])
              } else {
                setConversations(p => p.find(c => c.id === conv.id) ? p : [...p, conv])
              }
            }
            enrichAsync()
            return prev
          })
        })
      .subscribe()
  }

  async function fetchMessages(convId) {
    setMsgLoading(true)
    const { data } = await supabase
      .from('chat_messages').select('*, profiles(full_name, avatar_url)')
      .eq('conversation_id', convId).order('created_at', { ascending:true }).limit(300)
    setMessages(data || [])
    setMsgLoading(false)
  }

  function listenMessages(convId) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`chat:${convId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`conversation_id=eq.${convId}` },
        async payload => {
          if (payload.new.sender_id === user.id) return
          const { data: p } = await supabase.from('profiles').select('full_name,avatar_url').eq('id', payload.new.sender_id).single()
          setMessages(prev => [...prev, { ...payload.new, profiles: p }])
          setConversations(prev => prev.map(c => c.id === convId
            ? { ...c, last_message_at: payload.new.created_at, last_message_preview: payload.new.content?.slice(0,60) }
            : c))
        })
      .subscribe()
  }

  async function send() {
    if (!inputText.trim() || !activeConv || sending) return
    const content = inputText.trim()
    setInputText('')
    setSending(true)

    const { data: msg } = await supabase.from('chat_messages')
      .insert({ conversation_id: activeConv.id, club_id: clubId, sender_id: user.id, content })
      .select().single()

    if (msg) {
      // Optimistic update
      setMessages(prev => [...prev, { ...msg, profiles: myProfile }])
      const preview = content.slice(0, 60)
      await supabase.from('chat_conversations')
        .update({ last_message_at: msg.created_at, last_message_preview: preview })
        .eq('id', activeConv.id)
      setConversations(prev => prev.map(c => c.id === activeConv.id
        ? { ...c, last_message_at: msg.created_at, last_message_preview: preview } : c))
      markRead(activeConv.id)  // own message = already "read"

      // Push notification to all recipients
      try {
        let recipientIds = []
        if (activeConv.type === 'all') {
          // All club members except sender
          recipientIds = members.map(m => m.user_id).filter(id => id !== user.id)
        } else {
          const { data: convMembers } = await supabase
            .from('chat_members').select('user_id').eq('conversation_id', activeConv.id)
          recipientIds = (convMembers || []).map(m => m.user_id).filter(id => id !== user.id)
        }
        if (recipientIds.length > 0) {
          const senderName = myProfile?.full_name?.split(' ')[0] || 'Someone'
          const title = activeConv.type === 'all'
            ? `${club?.name || 'Chat'}`
            : activeConv.type === 'dm'
            ? senderName
            : (activeConv.name || 'Group Chat')
          const body = activeConv.type === 'dm'
            ? content.slice(0, 100)
            : `${senderName}: ${content.slice(0, 80)}`
          sendPush(recipientIds, title, body, `/club/${clubId}/chat`)
        }
      } catch (e) {
        console.warn('[chat] push failed:', e)
      }
    }

    setSending(false)
    inputRef.current?.focus()
  }

  async function openDM(member) {
    setShowNewDM(false)
    const { data: mOf } = await supabase.from('chat_members').select('conversation_id').eq('user_id', user.id)
    const ids = (mOf || []).map(m => m.conversation_id)
    if (ids.length > 0) {
      const { data: sh } = await supabase.from('chat_members').select('conversation_id')
        .eq('user_id', member.user_id).in('conversation_id', ids)
      for (const { conversation_id } of (sh || [])) {
        const { data: c } = await supabase.from('chat_conversations').select('*')
          .eq('id', conversation_id).eq('type','dm').maybeSingle()
        if (c) {
          const enriched = { ...c, otherUser: member.profiles, otherUserId: member.user_id }
          // Ensure conversations state has otherUserId set so Col 2 preview lookup works
          setConversations(prev => prev.map(conv =>
            conv.id === c.id ? { ...conv, otherUserId: member.user_id, otherUser: member.profiles } : conv
          ))
          setActiveConv(enriched)
          markRead(c.id)
          setPanel('chat')
          return
        }
      }
    }
    const { data: nc } = await supabase.from('chat_conversations')
      .insert({ club_id: clubId, type:'dm', created_by: user.id }).select().single()
    if (nc) {
      await supabase.from('chat_members').insert([
        { conversation_id: nc.id, user_id: user.id },
        { conversation_id: nc.id, user_id: member.user_id },
      ])
      const enriched = { ...nc, otherUser: member.profiles, otherUserId: member.user_id }
      setConversations(prev => { const [f,...r] = prev; return [f, enriched, ...r] })
      setActiveConv(enriched)
      markRead(nc.id)
      setPanel('chat')
    }
  }

  async function createGroup() {
    if (!groupName.trim() || groupSel.length === 0 || creatingGroup) return
    setCreatingGroup(true)
    const { data: nc } = await supabase.from('chat_conversations')
      .insert({ club_id: clubId, type:'group', name: groupName.trim(), created_by: user.id }).select().single()
    if (nc) {
      await supabase.from('chat_members').insert([
        { conversation_id: nc.id, user_id: user.id },
        ...groupSel.map(uid => ({ conversation_id: nc.id, user_id: uid })),
      ])
      setConversations(prev => { const [f,...r] = prev; return [f, nc, ...r] })
      setActiveConv(nc)
      setPanel('chat')
    }
    setGroupName(''); setGroupSel([]); setShowNewGroup(false); setCreatingGroup(false)
  }

  function convName(c) {
    if (!c) return ''
    if (c.type === 'all') return 'All Members'
    if (c.type === 'dm')  return c.otherUser?.full_name || 'Chat'
    return c.name || 'Group'
  }

  // ── guard states ─────────────────────────────────────────────────────────────
  if (status === 'loading') return (
    <div style={{ width:'100%', height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#256575', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:36, fontWeight:800, color:'#fff', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>S</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>Loading chat…</div>
    </div>
  )

  if (status === 'error') return (
    <div style={{ width:'100%', height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#256575', flexDirection:'column', gap:16, padding:32, textAlign:'center' }}>
      <div style={{ fontSize:36 }}>⚠️</div>
      <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>Chat couldn't load</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', lineHeight:1.6 }}>
        Make sure you ran the SQL setup in Supabase.<br/>Then reload the page.
      </div>
      {errorMsg ? (
        <div style={{ fontSize:11, color:'#ffcccc', background:'rgba(0,0,0,0.25)',
          padding:'10px 16px', borderRadius:10, maxWidth:340, wordBreak:'break-all', fontFamily:'monospace' }}>
          {errorMsg}
        </div>
      ) : null}
      <button onClick={() => navigate(-1)} style={{
        marginTop:8, padding:'10px 24px', background:'rgba(255,255,255,0.15)',
        border:'1px solid rgba(255,255,255,0.4)', borderRadius:10,
        color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>← Go back</button>
    </div>
  )

  const isMod = SUPER_ADMINS.includes(user?.email) || myMem?.role === 'moderator'
  const basePath = `/club/${clubId}/${isMod ? 'mod' : 'member'}`
  const navTabs = isMod
    ? [{id:'home',label:'Home'},{id:'members',label:'Members'},{id:'sessions',label:'Session'},{id:'settings',label:'Settings'}]
    : [{id:'home',label:'Home'},{id:'members',label:'Members'}]

  // ── render ───────────────────────────────────────────────────────────────────
  // Use position:fixed to break out of body max-width:430px on desktop
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:'calc(80px + env(safe-area-inset-bottom))', display:'flex', flexDirection:'column',
      background:'var(--bg)', overflow:'hidden' }}>

      {/* ══ Top bar ══ */}
      <div style={{ height:56, flexShrink:0, display:'flex', alignItems:'center',
        borderBottom:'0.5px solid var(--border)', background:'var(--bg2)',
        paddingTop:'env(safe-area-inset-top)' }}>

        {/* Mobile only: back arrow when viewing a chat */}
        {panel === 'chat' && (
          <button className="chat-back-btn" onClick={() => setPanel('list')} style={{
            background:'none', border:'none', fontSize:22, color:'var(--text2)',
            cursor:'pointer', padding:'0 14px', flexShrink:0 }}>←</button>
        )}

        {/* Back to dashboard (hidden on mobile when in chat panel) */}
        <button onClick={() => navigate(basePath)} style={{
          background:'none', border:'none', fontSize:13, color:'var(--text3)',
          cursor:'pointer', padding:'0 14px', flexShrink:0,
          display: panel === 'chat' ? 'none' : 'flex', alignItems:'center', gap:4 }}>
          ← Back
        </button>

        {/* Center: active conv name (mobile chat) or club name */}
        {panel === 'chat' && activeConv ? (
          <div className="chat-back-btn" style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0, paddingRight:14 }}>
            <Avatar src={activeConv.type==='dm' ? activeConv.otherUser?.avatar_url : null}
              name={convName(activeConv)} size={32}
              accent={activeConv.type==='all'} emoji={activeConv.type==='all' ? '👥' : null} />
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {convName(activeConv)}
              </div>
              {activeConv.type === 'all' && (
                <div style={{ fontSize:11, color:'var(--text3)' }}>{members.length} members</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex:1, minWidth:0, paddingLeft:4 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{club?.name}</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>Club Chat</div>
          </div>
        )}
      </div>

      {/* ══ 3-column body ══ */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* ── Col 1: Actions (desktop only, hidden on mobile) ── */}
        <div className="chat-col1" style={{
          width:0, overflow:'hidden', flexShrink:0,
          flexDirection:'column', alignItems:'stretch',
          borderRight:'0.5px solid var(--border)', background:'var(--bg2)',
        }}>
          <div style={{ padding:'16px 10px', display:'flex', flexDirection:'column', gap:8 }}>
            <button onClick={() => setShowNewDM(true)} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              padding:'12px 8px', borderRadius:'var(--radius)', border:'none',
              background:'var(--accent-dim)', color:'var(--accent)', cursor:'pointer',
              fontSize:11, fontWeight:600, fontFamily:"'Inter',sans-serif",
            }}>
              <span style={{ fontSize:20 }}>💬</span>
              New Chat
            </button>
            <button onClick={() => { setGroupName(''); setGroupSel([]); setShowNewGroup(true) }} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              padding:'12px 8px', borderRadius:'var(--radius)', border:'0.5px solid var(--border)',
              background:'var(--bg3)', color:'var(--text2)', cursor:'pointer',
              fontSize:11, fontWeight:600, fontFamily:"'Inter',sans-serif",
            }}>
              <span style={{ fontSize:20 }}>👥</span>
              New Group
            </button>
          </div>
        </div>

        {/* ── Col 2: All Members group + individual members ── */}
        <div className="chat-col2" style={{
          display: panel === 'chat' ? 'none' : 'flex',
          flexDirection:'column', overflowY:'auto',
          borderRight:'0.5px solid var(--border)',
          width:'100%', minHeight:0,
        }}>
          {/* Mobile-only: New Group button at top */}
          <div className="chat-col2-actions" style={{
            padding:'10px 12px', borderBottom:'0.5px solid var(--border)',
          }}>
            <button onClick={() => { setGroupName(''); setGroupSel([]); setShowNewGroup(true) }} style={{
              width:'100%', padding:'8px', borderRadius:'var(--radius-sm)',
              border:'0.5px solid var(--border)', background:'var(--bg3)', color:'var(--text2)',
              fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif",
            }}>👥 New Group</button>
          </div>

          {/* All Members group chat — always first */}
          {(() => {
            const allConv = conversations.find(c => c.type === 'all')
            if (!allConv) return null
            const active  = activeConv?.id === allConv.id
            const unread  = !active && isUnread(allConv)
            return (
              <div onClick={() => { setActiveConv(allConv); setPanel('chat'); markRead(allConv.id) }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', cursor:'pointer',
                  background: active ? 'var(--accent-dim)' : 'var(--bg2)',
                  borderBottom:'0.5px solid var(--border)',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                }}>
                <Avatar name="All Members" size={44} accent emoji="👥" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight: unread ? 700 : 600, color:'var(--text)' }}>
                    All Members
                  </div>
                  <div style={{ fontSize:12, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    fontWeight: unread ? 600 : 400,
                    color: unread ? 'var(--text)' : 'var(--text3)',
                  }}>
                    {allConv.last_message_preview || `${members.length} members · Say hi 👋`}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                  {allConv.last_message_at && (
                    <div style={{ fontSize:11, color: unread ? 'var(--accent)' : 'var(--text3)' }}>
                      {fmtTime(allConv.last_message_at)}
                    </div>
                  )}
                  {unread && (
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)' }} />
                  )}
                </div>
              </div>
            )
          })()}

          {/* Section label */}
          <div style={{ padding:'10px 14px 6px', fontSize:10, fontWeight:700,
            textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)',
            borderBottom:'0.5px solid var(--border)', background:'var(--bg)' }}>
            Members · {members.filter(m => m.user_id !== user.id && !m.is_guest).length}
          </div>

          {/* Individual members — click to open DM */}
          {members.filter(m => m.user_id !== user.id && !m.is_guest).map(m => {
            const existingDM = conversations.find(c => c.type === 'dm' && c.otherUserId === m.user_id)
            const active  = activeConv?.type === 'dm' && activeConv?.otherUserId === m.user_id
            const unread  = !active && existingDM && isUnread(existingDM)
            return (
              <div key={m.id} onClick={() => openDM(m)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', cursor:'pointer',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  borderBottom:'0.5px solid var(--border)',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                }}>
                <Avatar src={m.profiles?.avatar_url} name={m.profiles?.full_name} size={40} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, color:'var(--text)',
                    fontWeight: unread ? 700 : 500,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {m.profiles?.full_name}
                  </div>
                  <div style={{ fontSize:12, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    fontWeight: unread ? 600 : 400,
                    color: unread ? 'var(--text)' : 'var(--text3)',
                  }}>
                    {existingDM?.last_message_preview || ''}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                  {existingDM?.last_message_at && (
                    <div style={{ fontSize:11, color: unread ? 'var(--accent)' : 'var(--text3)' }}>
                      {fmtTime(existingDM.last_message_at)}
                    </div>
                  )}
                  {unread && (
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)' }} />
                  )}
                </div>
              </div>
            )
          })}

          {/* Custom group chats (if any) */}
          {conversations.filter(c => c.type === 'group').length > 0 && (
            <div style={{ padding:'10px 14px 6px', fontSize:10, fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)',
              borderBottom:'0.5px solid var(--border)', background:'var(--bg)' }}>
              Groups
            </div>
          )}
          {conversations.filter(c => c.type === 'group').map(conv => {
            const active = activeConv?.id === conv.id
            return (
              <div key={conv.id} onClick={() => { setActiveConv(conv); setPanel('chat') }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', cursor:'pointer',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  borderBottom:'0.5px solid var(--border)',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                }}>
                <Avatar name={conv.name} size={40} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:'var(--text)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {conv.name || 'Group'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:1,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {conv.last_message_preview || 'No messages yet'}
                  </div>
                </div>
                {conv.last_message_at && (
                  <div style={{ fontSize:11, color:'var(--text3)', flexShrink:0 }}>{fmtTime(conv.last_message_at)}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Col 3: Messages ── */}
        <div className="chat-col3" style={{
          display: panel === 'list' ? 'none' : 'flex',
          flexDirection:'column', flex:1, overflow:'hidden', minHeight:0,
        }}>
          {activeConv ? (
            <>
              {/* Conversation header (desktop — shows name above messages) */}
              <div className="chat-conv-header" style={{
                display:'none', alignItems:'center', gap:10,
                padding:'10px 16px', borderBottom:'0.5px solid var(--border)',
                background:'var(--bg2)', flexShrink:0,
              }}>
                <Avatar src={activeConv.type==='dm' ? activeConv.otherUser?.avatar_url : null}
                  name={convName(activeConv)} size={36}
                  accent={activeConv.type==='all'} emoji={activeConv.type==='all' ? '👥' : null} />
                <div>
                  <div style={{ fontSize:15, fontWeight:600 }}>{convName(activeConv)}</div>
                  {activeConv.type === 'all' && (
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{members.length} members</div>
                  )}
                </div>
              </div>

              {/* Message scroll area */}
              <div style={{ flex:1, overflowY:'auto', padding:'12px 14px',
                display:'flex', flexDirection:'column', gap:2, minHeight:0 }}>
                {msgLoading && (
                  <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13, padding:40 }}>Loading…</div>
                )}
                {!msgLoading && messages.length === 0 && (
                  <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13, padding:'60px 20px' }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
                    No messages yet — say hi!
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isMe = msg.sender_id === user.id
                  const prev = messages[i-1], next = messages[i+1]
                  const firstInGroup = msg.sender_id !== prev?.sender_id
                  const lastInGroup  = msg.sender_id !== next?.sender_id
                  return (
                    <div key={msg.id} style={{ display:'flex', flexDirection: isMe ? 'row-reverse' : 'row',
                      alignItems:'flex-end', gap:6, marginTop: firstInGroup ? 8 : 2 }}>
                      {!isMe && (
                        <div style={{ width:28, flexShrink:0 }}>
                          {lastInGroup && <Avatar src={msg.profiles?.avatar_url} name={msg.profiles?.full_name} size={28} />}
                        </div>
                      )}
                      <div style={{ maxWidth:'72%', display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        {!isMe && firstInGroup && (
                          <div style={{ fontSize:11, color:'var(--accent)', marginBottom:2, marginLeft:4, fontWeight:600 }}>
                            {msg.profiles?.full_name?.split(' ')[0]}
                          </div>
                        )}
                        <div style={{
                          padding:'8px 12px', fontSize:14, lineHeight:1.45, wordBreak:'break-word',
                          background: isMe ? 'var(--accent)' : 'var(--bg3)',
                          color: isMe ? '#fff' : 'var(--text)',
                          borderRadius: isMe
                            ? (firstInGroup ? '18px 18px 4px 18px' : '18px 4px 4px 18px')
                            : (firstInGroup ? '18px 18px 18px 4px' : '4px 18px 18px 4px'),
                        }}>{msg.content}</div>
                        {lastInGroup && (
                          <div style={{ fontSize:10, color:'var(--text3)', marginTop:2, marginLeft:4, marginRight:4 }}>
                            {fmtMsgTime(msg.created_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={endRef} />
              </div>

              {/* Message input */}
              <div style={{ display:'flex', gap:8, padding:'10px 14px',
                borderTop:'0.5px solid var(--border)', background:'var(--bg2)',
                alignItems:'flex-end', flexShrink:0,
                paddingBottom:'calc(10px + env(safe-area-inset-bottom))' }}>
                <div style={{ flex:1, background:'var(--bg3)', borderRadius:22, padding:'9px 14px',
                  display:'flex', alignItems:'center', border:'0.5px solid var(--border)' }}>
                  <input ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Message…"
                    style={{ flex:1, background:'none', border:'none', outline:'none',
                      color:'var(--text)', fontSize:14, fontFamily:"'Inter',sans-serif" }} />
                </div>
                <button onClick={send} disabled={!inputText.trim() || sending} style={{
                  width:42, height:42, borderRadius:'50%', border:'none', cursor:'pointer', flexShrink:0,
                  background: inputText.trim() ? 'var(--accent)' : 'var(--bg3)',
                  color: inputText.trim() ? '#fff' : 'var(--text3)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
                }}>↑</button>
              </div>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', color:'var(--text3)', gap:8 }}>
              <div style={{ fontSize:40 }}>💬</div>
              <div style={{ fontSize:14, fontWeight:500, color:'var(--text)' }}>Select a conversation</div>
              <div style={{ fontSize:12 }}>or start a new one</div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Tab bar ══ */}
      <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-around',
        borderTop:'0.5px solid var(--border)', background:'var(--bg2)',
        padding:'8px 8px', paddingBottom:'calc(8px + env(safe-area-inset-bottom))' }}>
        {navTabs.map(t => (
          <button key={t.id} onClick={() => navigate(`${basePath}?tab=${t.id}`)} style={{
            flex:1, padding:'8px 4px', background:'none', border:'none', cursor:'pointer',
            fontSize:12, fontWeight:500, color:'var(--text3)', fontFamily:"'Inter',sans-serif",
            borderRadius:8,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── New Chat modal ── */}
      {showNewDM && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:300,
          display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setShowNewDM(false)}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', padding:'24px 20px 48px',
            width:'100%', maxWidth:520, maxHeight:'70vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>New Chat</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16 }}>Select a member</div>
            {members.filter(m => m.user_id !== user.id).map(m => (
              <div key={m.id} onClick={() => openDM(m)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0',
                  borderBottom:'0.5px solid var(--border)', cursor:'pointer' }}>
                <Avatar src={m.profiles?.avatar_url} name={m.profiles?.full_name} size={42} />
                <div>
                  <div style={{ fontSize:14, fontWeight:500 }}>{m.profiles?.full_name}</div>
                  {m.role==='moderator' && <div style={{ fontSize:11, color:'var(--accent)' }}>Moderator</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── New Group modal ── */}
      {showNewGroup && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:300,
          display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setShowNewGroup(false)}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', padding:'24px 20px 48px',
            width:'100%', maxWidth:520, maxHeight:'80vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:16 }}>New Group Chat</div>
            <div className="input-wrap" style={{ marginBottom:16 }}>
              <label className="input-label">Group name</label>
              <input className="input" placeholder="e.g. Thursday crew" value={groupName}
                onChange={e => setGroupName(e.target.value)} autoFocus />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', fontWeight:700, textTransform:'uppercase',
              letterSpacing:'0.07em', marginBottom:10 }}>
              Add members ({groupSel.length} selected)
            </div>
            {members.filter(m => m.user_id !== user.id).map(m => {
              const sel = groupSel.includes(m.user_id)
              return (
                <div key={m.id} onClick={() => setGroupSel(prev => sel ? prev.filter(id=>id!==m.user_id) : [...prev,m.user_id])}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0',
                    borderBottom:'0.5px solid var(--border)', cursor:'pointer' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', flexShrink:0,
                    border:`2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                    background: sel ? 'var(--accent)' : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12, color:'#fff', fontWeight:700 }}>{sel ? '✓' : ''}</div>
                  <Avatar src={m.profiles?.avatar_url} name={m.profiles?.full_name} size={38} />
                  <div style={{ fontSize:14, fontWeight:500 }}>{m.profiles?.full_name}</div>
                </div>
              )
            })}
            <button className="btn btn-primary" style={{ marginTop:20 }}
              disabled={!groupName.trim() || groupSel.length===0 || creatingGroup}
              onClick={createGroup}>
              {creatingGroup ? 'Creating…' : `Create Group · ${groupSel.length+1} people`}
            </button>
            <button className="btn btn-ghost" style={{ marginTop:8 }} onClick={() => setShowNewGroup(false)}>Cancel</button>
          </div>
        </div>
      )}
      <BottomNav clubId={clubId} activeTab="home" />
    </div>
  )
}
