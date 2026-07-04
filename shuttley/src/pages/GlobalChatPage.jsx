import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

function Avatar({ src, name, size = 44 }) {
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

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-AU', { hour:'numeric', minute:'2-digit', hour12:true })
  const y = new Date(now); y.setDate(now.getDate()-1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { day:'numeric', month:'short' })
}

export default function GlobalChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('recent')
  const [contacts, setContacts] = useState([])
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(null)
  const [search, setSearch] = useState('')

  // Read state: convId → ISO timestamp
  const readKey = `chat-read:${user?.id}:global`
  const [readState, setReadState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(readKey) || '{}') }
    catch { return {} }
  })

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  async function loadData() {
    setLoading(true)
    try {
      // Load contacts for People tab
      await loadContacts()
      // Load conversations for Recent tab
      await loadConversations()
    } finally {
      setLoading(false)
    }
  }

  async function loadContacts() {
    // 1. Load current user's approved club memberships
    const { data: myMems } = await supabase
      .from('memberships')
      .select('club_id, clubs(id, name)')
      .eq('user_id', user.id)
      .eq('status', 'approved')

    const myClubIds = (myMems || []).map(m => m.club_id)
    const clubNameMap = Object.fromEntries((myMems || []).map(m => [m.club_id, m.clubs?.name]))

    if (myClubIds.length === 0) { return }

    // 2. Fetch all other non-guest approved members across those clubs
    const { data: otherMems } = await supabase
      .from('memberships')
      .select('user_id, club_id, is_guest, profiles(id, full_name, avatar_url)')
      .in('club_id', myClubIds)
      .eq('status', 'approved')
      .neq('user_id', user.id)

    // 3. Deduplicate into a contact map — skip guests and deleted accounts
    const contactMap = {}
    for (const mem of (otherMems || [])) {
      if (!mem.profiles || mem.is_guest) continue
      if (mem.profiles.full_name?.startsWith('deleted_')) continue
      if (!contactMap[mem.user_id]) {
        contactMap[mem.user_id] = {
          id: mem.user_id,
          full_name: mem.profiles.full_name,
          avatar_url: mem.profiles.avatar_url,
          sharedClubs: [],
        }
      }
      contactMap[mem.user_id].sharedClubs.push({ id: mem.club_id, name: clubNameMap[mem.club_id] })
    }

    const sorted = Object.values(contactMap)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    setContacts(sorted)
  }

  async function loadConversations() {
    // Get all conversations user is a member of
    const { data: myConvs } = await supabase
      .from('chat_members')
      .select('conversation_id')
      .eq('user_id', user.id)

    if (!myConvs || myConvs.length === 0) {
      setConversations([])
      return
    }

    const convIds = myConvs.map(m => m.conversation_id)

    // Fetch conversation details with last message info
    const { data: convs } = await supabase
      .from('chat_conversations')
      .select('id, type, club_id, last_message_at, last_message_preview, created_by')
      .in('id', convIds)

    if (!convs || convs.length === 0) {
      setConversations([])
      return
    }

    // For DMs, fetch the other participant info
    const enriched = await Promise.all(convs.map(async (conv) => {
      if (conv.type === 'dm') {
        const { data: members } = await supabase
          .from('chat_members')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', user.id)

        if (members && members.length > 0) {
          const otherUserId = members[0].user_id
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', otherUserId)
            .single()

          return {
            ...conv,
            otherUser: profile,
          }
        }
      }
      return conv
    }))

    // Filter out empty conversations (no messages)
    const withMessages = enriched.filter(conv =>
      conv.last_message_at && conv.last_message_preview
    )

    // Sort by last_message_at DESC
    const sorted = withMessages.sort((a, b) => {
      const timeA = new Date(a.last_message_at || 0).getTime()
      const timeB = new Date(b.last_message_at || 0).getTime()
      return timeB - timeA
    })

    setConversations(sorted)
  }

  function isUnread(conv) {
    if (!conv?.last_message_at) return false
    const readAt = readState[conv.id]
    if (!readAt) return !!conv.last_message_preview
    return new Date(conv.last_message_at) > new Date(readAt)
  }

  function markRead(convId) {
    const updated = { ...readState, [convId]: new Date().toISOString() }
    setReadState(updated)
    try { localStorage.setItem(readKey, JSON.stringify(updated)) } catch {}
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(c =>
      c.full_name?.toLowerCase().includes(q) ||
      c.sharedClubs.some(cl => cl.name?.toLowerCase().includes(q))
    )
  }, [contacts, search])

  async function openChat(contact) {
    if (opening) return
    setOpening(contact.id)

    const sharedClubIds = contact.sharedClubs.map(c => c.id)
    const primaryClubId = sharedClubIds[0]

    // Look for an existing DM with this person in any shared club
    const { data: myConvIds } = await supabase
      .from('chat_members').select('conversation_id').eq('user_id', user.id)
    const myIds = (myConvIds || []).map(m => m.conversation_id)

    let convId = null

    if (myIds.length > 0) {
      const { data: shared } = await supabase
        .from('chat_members').select('conversation_id')
        .eq('user_id', contact.id).in('conversation_id', myIds)
      for (const { conversation_id } of (shared || [])) {
        const { data: c } = await supabase
          .from('chat_conversations').select('id, club_id, type')
          .eq('id', conversation_id).eq('type', 'dm').maybeSingle()
        if (c && sharedClubIds.includes(c.club_id)) {
          convId = c.id
          break
        }
      }
    }

    if (!convId) {
      const { data: nc } = await supabase
        .from('chat_conversations')
        .insert({ club_id: primaryClubId, type: 'dm', created_by: user.id })
        .select().single()
      if (nc) {
        await supabase.from('chat_members').insert([
          { conversation_id: nc.id, user_id: user.id },
          { conversation_id: nc.id, user_id: contact.id },
        ])
        convId = nc.id
      }
    }

    setOpening(null)
    if (convId) {
      markRead(convId)
      navigate(`/chat/${convId}`, { state: { contact } })
    }
  }

  function sharedLabel(contact) {
    return contact.sharedClubs.map(c => c.name).filter(Boolean).join(' · ') || '1 group in common'
  }

  function openConversation(conv) {
    if (conv.type === 'dm') {
      markRead(conv.id)
      navigate(`/chat/${conv.id}`, { state: { contact: conv.otherUser } })
    }
  }

  return (
    <div className="page">
      <div className="topnav">
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
          Chat
        </span>
        <div style={{ width: 40 }} />
      </div>

      <div className="content">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '0.5px solid var(--border)' }}>
          <button
            onClick={() => setTab('recent')}
            style={{
              flex: 1, padding: '12px', background: 'none', border: 'none',
              fontSize: 14, fontWeight: tab === 'recent' ? 600 : 500,
              color: tab === 'recent' ? 'var(--accent)' : 'var(--text3)',
              cursor: 'pointer', borderBottom: tab === 'recent' ? '2px solid var(--accent)' : 'none',
              transition: 'all 0.2s', fontFamily: "'Inter',sans-serif"
            }}>
            Recent
          </button>
          <button
            onClick={() => setTab('people')}
            style={{
              flex: 1, padding: '12px', background: 'none', border: 'none',
              fontSize: 14, fontWeight: tab === 'people' ? 600 : 500,
              color: tab === 'people' ? 'var(--accent)' : 'var(--text3)',
              cursor: 'pointer', borderBottom: tab === 'people' ? '2px solid var(--accent)' : 'none',
              transition: 'all 0.2s', fontFamily: "'Inter',sans-serif"
            }}>
            People
          </button>
        </div>

        {tab === 'recent' ? (
          <>
            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">💬</div>
                <p>No recent chats</p>
                <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
                  Start a conversation from the People tab
                </p>
              </div>
            ) : (
              <div style={{
                background: 'var(--bg2)', border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)', overflow: 'hidden',
              }}>
                {conversations.map((conv, idx) => {
                  const unread = isUnread(conv)
                  return (
                    <div key={conv.id}>
                      <div
                        onClick={() => openConversation(conv)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 16px',
                          cursor: 'pointer',
                          background: unread ? 'rgba(122,164,196,0.06)' : 'transparent',
                          transition: 'background 0.15s',
                        }}>
                        <Avatar src={conv.otherUser?.avatar_url} name={conv.otherUser?.full_name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: unread ? 700 : 600,
                            color: 'var(--text)', marginBottom: 2,
                            display: 'flex', alignItems: 'center', gap: 8
                          }}>
                            {conv.otherUser?.full_name || 'Chat'}
                            {unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                          </div>
                          <div style={{
                            fontSize: 12, color: unread ? 'var(--text2)' : 'var(--text3)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            fontWeight: unread ? 500 : 400
                          }}>
                            {conv.last_message_preview || 'No messages yet'}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, fontSize: 12, color: 'var(--text3)', textAlign: 'right' }}>
                          {fmtTime(conv.last_message_at)}
                        </div>
                      </div>
                      {idx < conversations.length - 1 && (
                        <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 72 }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Search input */}
            <div style={{ marginBottom: 16 }}>
              <input
                className="input"
                type="search"
                placeholder="Search by name or group…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 'var(--radius)' }}
              />
            </div>

            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
            ) : contacts.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">💬</div>
                <p>No contacts yet. Join a group to find people to chat with.</p>
                <button className="btn btn-primary" onClick={() => navigate('/groups')} style={{ marginTop: 12 }}>
                  Find a group
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>
                No results for "{search}"
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  People you play with
                </div>
                <div style={{
                  background: 'var(--bg2)', border: '0.5px solid var(--border)',
                  borderRadius: 'var(--radius)', overflow: 'hidden',
                }}>
                  {filtered.map((c, idx) => (
                    <div key={c.id}>
                      <div
                        onClick={() => openChat(c)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 16px',
                          cursor: opening ? 'default' : 'pointer',
                          opacity: opening === c.id ? 0.5 : 1,
                          transition: 'opacity 0.15s',
                        }}>
                        <Avatar src={c.avatar_url} name={c.full_name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                            {c.full_name || 'Member'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sharedLabel(c)}
                          </div>
                        </div>
                        <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0 }}>›</span>
                      </div>
                      {idx < filtered.length - 1 && (
                        <div style={{ borderTop: '0.5px solid var(--border)', marginLeft: 72 }} />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <BottomNav activeTab="chat" />
    </div>
  )
}
