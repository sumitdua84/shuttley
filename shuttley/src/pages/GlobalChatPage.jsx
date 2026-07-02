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

export default function GlobalChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!user) return
    loadContacts()
  }, [user])

  async function loadContacts() {
    // 1. Load current user's approved club memberships
    const { data: myMems } = await supabase
      .from('memberships')
      .select('club_id, clubs(id, name)')
      .eq('user_id', user.id)
      .eq('status', 'approved')

    const myClubIds = (myMems || []).map(m => m.club_id)
    const clubNameMap = Object.fromEntries((myMems || []).map(m => [m.club_id, m.clubs?.name]))

    if (myClubIds.length === 0) { setLoading(false); return }

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
    setLoading(false)
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
      navigate(`/chat/${convId}`, { state: { contact } })
    }
  }

  function sharedLabel(contact) {
    return contact.sharedClubs.map(c => c.name).filter(Boolean).join(' · ') || '1 group in common'
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
      </div>

      <BottomNav activeTab="chat" />
    </div>
  )
}
