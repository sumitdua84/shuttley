import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import GroupNav from '../components/GroupNav'

const SPLIT_TYPES = [
  { key: 'equal',      label: 'Equal',      icon: '⚖️' },
  { key: 'percentage', label: 'Percentage',  icon: '%'  },
  { key: 'shares',     label: 'Shares',      icon: '#'  },
]

export default function SplitsPage() {
  const { clubId }                    = useParams()
  const { user }                      = useAuth()
  const navigate                      = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [club, setClub]         = useState(null)
  const [members, setMembers]   = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading]   = useState(true)
  const [userRole, setUserRole] = useState('member') // 'member' | 'moderator'
  const [tab, setTab]           = useState(searchParams.get('tab') || 'balances')

  function changeTab(t) {
    setTab(t)
    setSearchParams({ tab: t }, { replace: true })
  }
  const [toast, setToast]       = useState('')

  // ── Add / Edit expense modal state ──────────────────────────────
  const [showAdd, setShowAdd]         = useState(false)
  const [editingExpense, setEditingExpense] = useState(null) // null = add mode
  const [desc, setDesc]               = useState('')
  const [amount, setAmount]           = useState('')
  const [paidBy, setPaidBy]           = useState('')
  const [splitType, setSplitType]     = useState('equal')
  // equal: Set of checked user IDs
  const [equalAmong, setEqualAmong]   = useState([])
  // percentage: { [userId]: number 0-100 }
  const [pctConfig, setPctConfig]     = useState({})
  // shares: { [userId]: number >= 0 }
  const [shareConfig, setShareConfig] = useState({})
  const [saving, setSaving]           = useState(false)
  // receipt image
  const [imageFile, setImageFile]     = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const fileInputRef                  = useRef(null)

  // ── Settle-up modal state ────────────────────────────────────────
  const [settling, setSettling]               = useState(null)   // { from, to, amount }
  const [settleAmount, setSettleAmount]       = useState('')
  const [settleImageFile, setSettleImageFile] = useState(null)
  const [settleImagePreview, setSettleImagePreview] = useState(null)
  const settleFileInputRef                    = useRef(null)

  function openSettle(d) {
    setSettling(d)
    setSettleAmount(d.amount.toFixed(2))
    setSettleImageFile(null)
    setSettleImagePreview(null)
  }

  function handleSettleImagePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSettleImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setSettleImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  function removeSettleImage() {
    setSettleImageFile(null)
    setSettleImagePreview(null)
    if (settleFileInputRef.current) settleFileInputRef.current.value = ''
  }

  useEffect(() => { fetchAll() }, [clubId, user])

  async function fetchAll() {
    if (!user) return
    setLoading(true)
    try {
      const [clubRes, memRes, expRes] = await Promise.all([
        supabase.from('clubs').select('id, name').eq('id', clubId).single(),
        supabase.from('memberships')
          .select('user_id, role, is_guest, profiles(id, full_name, avatar_url)')
          .eq('club_id', clubId).eq('status', 'approved'),
        supabase.from('splits_expenses')
          .select('*, splits_participants(user_id, share)')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false }),
      ])

      setClub(clubRes.data)

      const allMems = memRes.data || []
      const myMem   = allMems.find(m => m.user_id === user.id)
      const SUPER_ADMINS = ['sumit@shuttley.club']
      setUserRole(
        SUPER_ADMINS.includes(user.email) || myMem?.role === 'moderator'
          ? 'moderator' : 'member'
      )

      const mems = allMems
        .filter(m => !m.is_guest)
        .map(m => m.profiles).filter(Boolean)
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
      setMembers(mems)
      initFormDefaults(mems)
      setExpenses(expRes.data || [])
    } catch (e) {
      console.error('[Splits] fetch error', e)
    }
    setLoading(false)
  }

  function initFormDefaults(mems) {
    const ids = mems.map(m => m.id)
    setPaidBy(user.id)
    setEqualAmong(ids)
    const eqPct = mems.length ? round2(100 / mems.length) : 0
    const pct = {}; ids.forEach(id => { pct[id] = eqPct }); setPctConfig(pct)
    const sh  = {}; ids.forEach(id => { sh[id]  = 0 });     setShareConfig(sh)
    setSplitType('equal')
    setEditingExpense(null)
    setImageFile(null)
    setImagePreview(null)
  }

  function openEdit(exp) {
    setEditingExpense(exp)
    setDesc(exp.description)
    setAmount(String(exp.amount))
    setPaidBy(exp.paid_by)
    setSplitType('equal')
    // Pre-check the participants that were in this expense
    const participantIds = (exp.splits_participants || []).map(p => p.user_id)
    setEqualAmong(participantIds.length ? participantIds : members.map(m => m.id))
    // Reset other split configs to default
    const ids = members.map(m => m.id)
    const eqPct = ids.length ? round2(100 / ids.length) : 0
    const pct = {}; ids.forEach(id => { pct[id] = eqPct }); setPctConfig(pct)
    const sh  = {}; ids.forEach(id => { sh[id]  = 0 });     setShareConfig(sh)
    // Show existing image (imageFile stays null — only set when user picks a NEW file)
    setImageFile(null)
    setImagePreview(exp.image_url || null)
    setShowAdd(true)
  }

  function handleImagePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleSplitTypeChange(type) {
    setSplitType(type)
    // Re-initialise configs when switching so numbers are sensible defaults
    const ids = members.map(m => m.id)
    if (type === 'percentage') {
      const eqPct = ids.length ? round2(100 / ids.length) : 0
      const pct = {}; ids.forEach(id => { pct[id] = eqPct }); setPctConfig(pct)
    }
    if (type === 'shares') {
      const sh = {}; ids.forEach(id => { sh[id] = 0 }); setShareConfig(sh)
    }
    if (type === 'equal') {
      setEqualAmong(ids)
    }
  }

  // ── Compute per-person dollar shares for saving ──────────────────
  function computeParticipants(amt) {
    if (splitType === 'equal') {
      if (!equalAmong.length) return []
      const share = round2(amt / equalAmong.length)
      return equalAmong.map(uid => ({ uid, share }))
    }
    if (splitType === 'percentage') {
      return Object.entries(pctConfig)
        .filter(([, pct]) => pct > 0)
        .map(([uid, pct]) => ({ uid, share: round2((pct / 100) * amt) }))
    }
    if (splitType === 'shares') {
      const totalSh = Object.values(shareConfig).reduce((s, v) => s + Number(v), 0)
      if (!totalSh) return []
      return Object.entries(shareConfig)
        .filter(([, sh]) => Number(sh) > 0)
        .map(([uid, sh]) => ({ uid, share: round2((Number(sh) / totalSh) * amt) }))
    }
    return []
  }

  // Live preview of shares (for UI display)
  function previewShares() {
    const amt = parseFloat(amount) || 0
    return computeParticipants(amt)
  }

  function shareForMember(uid) {
    return previewShares().find(p => p.uid === uid)?.share ?? 0
  }

  // Validation
  function canSubmit() {
    if (!desc.trim() || !amount || parseFloat(amount) <= 0) return false
    if (splitType === 'equal') return equalAmong.length > 0
    if (splitType === 'percentage') {
      const total = Object.values(pctConfig).reduce((s, v) => s + Number(v), 0)
      return Math.abs(total - 100) < 0.5 && Object.values(pctConfig).some(v => v > 0)
    }
    if (splitType === 'shares') {
      return Object.values(shareConfig).some(v => Number(v) > 0)
    }
    return false
  }

  // ── Add / Edit expense ──────────────────────────────────────────
  async function addExpense() {
    if (!canSubmit()) return
    setSaving(true)
    try {
      const amt = parseFloat(parseFloat(amount).toFixed(2))
      const participants = computeParticipants(amt)

      // Upload new receipt image if a new file was picked
      // imagePreview set but imageFile null = keep existing URL
      // imagePreview null = image was removed
      let image_url = imageFile === null && imagePreview ? imagePreview : null
      if (imageFile) {
        const ext  = imageFile.name.split('.').pop()
        const path = `${clubId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('splits').upload(path, imageFile, { upsert: false })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('splits').getPublicUrl(path)
        image_url = urlData.publicUrl
      }

      if (editingExpense) {
        // ── EDIT MODE ──────────────────────────────────────────────
        // Append current state to audit trail before overwriting
        const prevHistory = editingExpense.edit_history || []
        const edit_history = [...prevHistory, {
          at:          new Date().toISOString(),
          amount:      Number(editingExpense.amount),
          description: editingExpense.description,
          paid_by:     editingExpense.paid_by,
          participants: (editingExpense.splits_participants || []).map(p => ({ user_id: p.user_id, share: p.share })),
        }]

        const { error: updErr } = await supabase
          .from('splits_expenses')
          .update({ description: desc.trim(), amount: amt, paid_by: paidBy, image_url, edit_history })
          .eq('id', editingExpense.id)
        if (updErr) throw updErr

        // Replace participants
        const { error: delErr } = await supabase
          .from('splits_participants')
          .delete().eq('expense_id', editingExpense.id)
        if (delErr) throw delErr

        const { error: partErr } = await supabase
          .from('splits_participants')
          .insert(participants.map(p => ({ expense_id: editingExpense.id, user_id: p.uid, share: p.share })))
        if (partErr) throw partErr

        flash('Expense updated ✓')
      } else {
        // ── ADD MODE ───────────────────────────────────────────────
        const { data: expense, error: expErr } = await supabase
          .from('splits_expenses')
          .insert({ club_id: clubId, description: desc.trim(), amount: amt, paid_by: paidBy, created_by: user.id, image_url })
          .select().single()
        if (expErr) throw expErr

        const { error: partErr } = await supabase
          .from('splits_participants')
          .insert(participants.map(p => ({ expense_id: expense.id, user_id: p.uid, share: p.share })))
        if (partErr) throw partErr

        flash('Expense added ✓')
      }

      setShowAdd(false)
      setDesc('')
      setAmount('')
      initFormDefaults(members)
      await fetchAll()
    } catch (e) {
      console.error(e)
      flash('Error: ' + e.message)
    }
    setSaving(false)
  }

  // ── Settle up ────────────────────────────────────────────────────
  async function confirmSettle() {
    if (!settling) return
    const { from: fromId, to: toId } = settling
    const amt = parseFloat(parseFloat(settleAmount).toFixed(2))
    if (!amt || amt <= 0) return
    setSettling(null)
    setSaving(true)
    try {
      // Upload proof image if provided
      let image_url = null
      if (settleImageFile) {
        const ext  = settleImageFile.name.split('.').pop()
        const path = `${clubId}/settle-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('splits').upload(path, settleImageFile, { upsert: false })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('splits').getPublicUrl(path)
        image_url = urlData.publicUrl
      }

      const { data: exp, error: expErr } = await supabase
        .from('splits_expenses')
        .insert({
          club_id: clubId,
          description: `${memberName(fromId)} → ${memberName(toId)}`,
          amount: amt, paid_by: fromId, created_by: user.id,
          is_settlement: true, image_url,
        })
        .select().single()
      if (expErr) throw expErr

      const { error: partErr } = await supabase
        .from('splits_participants')
        .insert({ expense_id: exp.id, user_id: toId, share: amt })
      if (partErr) throw partErr

      flash('Settled up! 🎉')
      await fetchAll()
    } catch (e) { flash('Error: ' + e.message) }
    setSaving(false)
  }

  // ── Balance calculation ──────────────────────────────────────────
  function computeBalances() {
    const debts = {}
    expenses.forEach(exp => {
      ;(exp.splits_participants || []).forEach(p => {
        if (p.user_id === exp.paid_by) return
        if (!debts[p.user_id]) debts[p.user_id] = {}
        debts[p.user_id][exp.paid_by] = (debts[p.user_id][exp.paid_by] || 0) + Number(p.share)
      })
    })
    const net = []; const seen = new Set()
    Object.keys(debts).forEach(from => {
      Object.keys(debts[from]).forEach(to => {
        const key = [from, to].sort().join('|')
        if (seen.has(key)) return; seen.add(key)
        const aOwesB = debts[from]?.[to] || 0
        const bOwesA = debts[to]?.[from] || 0
        const diff = aOwesB - bOwesA
        if (Math.abs(diff) < 0.005) return
        if (diff > 0) net.push({ from, to,    amount: round2(diff)  })
        else          net.push({ from: to, to: from, amount: round2(-diff) })
      })
    })
    return net
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function round2(n) { return Math.round(n * 100) / 100 }
  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function memberName(id) { return members.find(m => m.id === id)?.full_name || 'Unknown' }
  function memberAvatar(id) { return members.find(m => m.id === id)?.avatar_url || null }
  function fmt(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  }
  function fmtFull(d) {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const balances      = computeBalances()
  const myDebts       = balances.filter(d => d.from === user?.id)
  const owedToMe      = balances.filter(d => d.to   === user?.id)
  const otherBalances = balances.filter(d => d.from !== user?.id && d.to !== user?.id)
  const [showOthers, setShowOthers]           = useState(false)
  const [expandedEdits, setExpandedEdits]     = useState({})

  const pctTotal = Object.values(pctConfig).reduce((s, v) => s + Number(v), 0)
  const sharesTotalAmt = parseFloat(amount) || 0
  const sharesTotal    = Object.values(shareConfig).reduce((s, v) => s + Number(v), 0)

  return (
    <div className="page" style={{ maxWidth: 430, margin: '0 auto' }}>

      {/* ── Top nav ── */}
      <div className="topnav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ padding: '8px 12px' }}>←</button>
          <div>
            <div style={{ fontFamily: 'var(--font-brand)', fontWeight: 700, fontSize: 18, color: 'var(--accent)', lineHeight: 1 }}>
              💰 Splits
            </div>
            {club && <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, marginTop: 2 }}>{club.name}</div>}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add expense</button>
      </div>

      <div className="content">
        {loading && <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '48px 0' }}>Loading…</div>}

        {!loading && (<>
          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[['balances', '⚖️ Balances'], ['history', '📋 History']].map(([key, label]) => (
              <button key={key} onClick={() => changeTab(key)} style={{
                padding: '8px 20px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: tab === key ? 'none' : '1px solid var(--border)',
                background: tab === key ? 'var(--accent)' : 'transparent',
                color: tab === key ? '#fff' : 'var(--text2)',
              }}>{label}</button>
            ))}
          </div>

          {/* ── BALANCES ── */}
          {tab === 'balances' && (
            <div>

              {/* ── You Owe ── */}
              <div className="section-label">You owe</div>
              <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 }}>
                {myDebts.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text3)' }}>Nothing — you're all clear ✓</div>
                ) : myDebts.map((d, i) => (
                  <BalanceRow key={i} d={d} last={i === myDebts.length - 1}
                    fromLabel="You" fromColor="var(--danger)"
                    toLabel={memberName(d.to)} toColor="var(--text)"
                    amtColor="var(--danger)"
                    onSettle={() => openSettle(d)} settling={saving}
                    fromAvatar={memberAvatar(d.from)} toAvatar={memberAvatar(d.to)} />
                ))}
              </div>

              {/* ── You're Owed ── */}
              <div className="section-label">You're owed</div>
              <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 }}>
                {owedToMe.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text3)' }}>No one owes you anything yet</div>
                ) : owedToMe.map((d, i) => (
                  <BalanceRow key={i} d={d} last={i === owedToMe.length - 1}
                    fromLabel={memberName(d.from)} fromColor="var(--text)"
                    toLabel="you" toColor="var(--success)"
                    amtColor="var(--success)"
                    fromAvatar={memberAvatar(d.from)} toAvatar={memberAvatar(d.to)} />
                ))}
              </div>

              {/* ── All other balances (collapsed) ── */}
              {otherBalances.length > 0 && (
                <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 }}>
                  <button onClick={() => setShowOthers(v => !v)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.04em' }}>
                      All member balances ({otherBalances.length})
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text3)', transition: 'transform 0.2s', display: 'inline-block', transform: showOthers ? 'rotate(90deg)' : 'none' }}>›</span>
                  </button>
                  {showOthers && otherBalances.map((d, i) => (
                    <BalanceRow key={i} d={d} last={i === otherBalances.length - 1}
                      fromLabel={memberName(d.from)} fromColor="var(--text)"
                      toLabel={memberName(d.to)} toColor="var(--text)"
                      amtColor="var(--text2)"
                      fromAvatar={memberAvatar(d.from)} toAvatar={memberAvatar(d.to)}
                      bordered />
                  ))}
                </div>
              )}

              {balances.length === 0 && (
                <div className="empty">
                  <div className="empty-icon">🤝</div>
                  <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>All settled up!</p>
                  <p style={{ fontSize: 13 }}>Add an expense to start splitting costs.</p>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            <div>
              {expenses.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">📋</div>
                  <p style={{ fontSize: 15, marginBottom: 6 }}>No expenses yet</p>
                  <p style={{ fontSize: 13 }}>Add your first expense above.</p>
                </div>
              ) : (<>
                <div className="section-label">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</div>
                <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  {expenses.map((exp, idx) => {
                    const parts   = exp.splits_participants || []
                    const myPart  = parts.find(p => p.user_id === user?.id)
                    const iPaid   = exp.paid_by === user?.id
                    const isSett  = exp.is_settlement
                    const edits   = exp.edit_history || []
                    const edited  = edits.length > 0
                    const showEd  = expandedEdits[exp.id]
                    const isLast  = idx === expenses.length - 1

                    return (
                      <div key={exp.id} style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border)' }}>
                        {/* Main row */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px' }}>
                          {/* Icon */}
                          <div style={{
                            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                            background: isSett ? 'var(--success-dim)' : 'var(--accent-dim)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                          }}>
                            {isSett ? '✅' : '💸'}
                          </div>

                          {/* Info — 2 lines */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Line 1: description + badges */}
                            <div style={{ fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              {exp.description}
                              {isSett && <span style={{ fontSize: 9, letterSpacing: '0.06em', background: 'var(--success-dim)', color: 'var(--success)', padding: '2px 6px', borderRadius: 99, textTransform: 'uppercase' }}>Settlement</span>}
                              {edited && <span style={{ fontSize: 9, letterSpacing: '0.06em', background: 'var(--bg3)', color: 'var(--text3)', padding: '2px 6px', borderRadius: 99, textTransform: 'uppercase' }}>Edited</span>}
                            </div>
                            {/* Line 2: all meta condensed */}
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                              {iPaid ? 'You' : memberName(exp.paid_by)} paid
                              {!isSett && parts.length > 0 && ` · ${parts.length}p`}
                              {myPart && !isSett && !iPaid && <span style={{ color: 'var(--danger)' }}> · your share ${Number(myPart.share).toFixed(2)}</span>}
                              {myPart && !isSett &&  iPaid && <span style={{ color: 'var(--success)' }}> · you covered</span>}
                            </div>
                          </div>

                          {/* Amount + date + edit — right column */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--accent)' }}>${Number(exp.amount).toFixed(2)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{fmt(exp.created_at)}</div>
                            <button onClick={() => openEdit(exp)} style={{
                              marginTop: 2, fontSize: 11, color: 'var(--text3)',
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                              textDecoration: 'underline',
                            }}>Edit</button>
                          </div>
                        </div>

                        {/* Receipt image */}
                        {exp.image_url && (
                          <a href={exp.image_url} target="_blank" rel="noreferrer"
                            style={{ display: 'block', padding: '0 14px 11px' }}>
                            <img src={exp.image_url} alt="Receipt"
                              style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, border: '0.5px solid var(--border)' }} />
                          </a>
                        )}

                        {/* Edit history trail */}
                        {edited && (
                          <div style={{ padding: '0 14px 11px' }}>
                            <button onClick={() => setExpandedEdits(prev => ({ ...prev, [exp.id]: !prev[exp.id] }))}
                              style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              ✏️ {edits.length} edit{edits.length !== 1 ? 's' : ''} — {showEd ? 'hide' : 'show'} history
                            </button>
                            {showEd && (
                              <div style={{ marginTop: 8, borderLeft: '2px solid var(--border2)', paddingLeft: 10 }}>
                                {[...edits].reverse().map((e, i) => (
                                  <div key={i} style={{ marginBottom: 6 }}>
                                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtFull(e.at)}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                                      was "{e.description}" · ${Number(e.amount).toFixed(2)} · paid by {memberName(e.paid_by)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>)}
            </div>
          )}
        </>)}
      </div>

      {/* ── Add Expense Modal ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); initFormDefaults(members) } }}>
          <div style={{
            background: 'var(--bg)', borderRadius: '20px 20px 0 0',
            padding: '24px 20px calc(28px + env(safe-area-inset-bottom))',
            width: '100%', maxWidth: 430, margin: '0 auto', maxHeight: '92vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{editingExpense ? '✏️ Edit Expense' : 'Add Expense'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); initFormDefaults(members) }}>✕</button>
            </div>

            {/* Description */}
            <div className="input-wrap">
              <label className="input-label">What was it for?</label>
              <input className="input" placeholder="e.g. Court booking, shuttlecocks, drinks…"
                value={desc} onChange={e => setDesc(e.target.value)} autoFocus />
            </div>

            {/* Receipt image */}
            <div className="input-wrap">
              <label className="input-label">Receipt (optional)</label>
              <input ref={fileInputRef} type="file" accept="image/*"
                style={{ display: 'none' }} onChange={handleImagePick} />
              {imagePreview ? (
                <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '0.5px solid var(--border2)' }}>
                  <img src={imagePreview} alt="Receipt" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
                  <button onClick={removeImage} style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)', border: 'none',
                    color: '#fff', fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} style={{
                  width: '100%', padding: '14px', borderRadius: 'var(--radius-sm)',
                  border: '1.5px dashed var(--border2)', background: 'var(--bg3)',
                  color: 'var(--text3)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                }}>
                  📷 Add receipt photo
                </button>
              )}
            </div>

            {/* Amount */}
            <div className="input-wrap">
              <label className="input-label">Amount (A$)</label>
              <input className="input" type="number" inputMode="decimal" placeholder="0.00" min="0" step="0.01"
                value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            {/* Paid by */}
            <div className="input-wrap">
              <label className="input-label">Paid by</label>
              <select className="input" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || 'Unknown'}{m.id === user.id ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Split method selector */}
            <div className="input-wrap" style={{ marginBottom: 12 }}>
              <label className="input-label">Split by</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {SPLIT_TYPES.map(t => (
                  <button key={t.key} onClick={() => handleSplitTypeChange(t.key)} style={{
                    flex: 1, padding: '9px 4px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', border: 'none',
                    background: splitType === t.key ? 'var(--accent)' : 'var(--bg3)',
                    color: splitType === t.key ? '#fff' : 'var(--text2)',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ fontSize: 14, marginBottom: 1 }}>{t.icon}</div>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── EQUAL ── */}
            {splitType === 'equal' && (
              <div className="input-wrap" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="input-label" style={{ marginBottom: 0 }}>Split among</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => setEqualAmong(members.map(m => m.id))}>All</button>
                    <button style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => setEqualAmong([])}>None</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {members.map(m => {
                    const checked = equalAmong.includes(m.id)
                    const share   = checked && equalAmong.length && amount
                      ? round2(parseFloat(amount) / equalAmong.length)
                      : 0
                    return (
                      <label key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: checked ? 'var(--accent-dim)' : 'var(--bg3)',
                        border: `0.5px solid ${checked ? 'var(--accent)' : 'transparent'}`,
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                        <input type="checkbox" checked={checked}
                          onChange={e => {
                            if (e.target.checked) setEqualAmong(prev => [...prev, m.id])
                            else setEqualAmong(prev => prev.filter(id => id !== m.id))
                          }}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                          {m.full_name || 'Unknown'}
                          {m.id === user.id && <span style={{ color: 'var(--text3)', fontSize: 12 }}> (you)</span>}
                        </span>
                        {checked && share > 0 && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>${share.toFixed(2)}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
                {equalAmong.length > 0 && amount && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                    ${round2(parseFloat(amount) / equalAmong.length).toFixed(2)} each · {equalAmong.length} {equalAmong.length === 1 ? 'person' : 'people'}
                  </div>
                )}
              </div>
            )}

            {/* ── PERCENTAGE ── */}
            {splitType === 'percentage' && (
              <div className="input-wrap" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="input-label" style={{ marginBottom: 0 }}>Percentage each</label>
                  <div style={{
                    fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                    background: Math.abs(pctTotal - 100) < 0.5 ? 'var(--success-dim)' : 'var(--danger-dim)',
                    color:      Math.abs(pctTotal - 100) < 0.5 ? 'var(--success)'     : 'var(--danger)',
                  }}>
                    {round2(pctTotal)}% {Math.abs(pctTotal - 100) < 0.5 ? '✓' : '≠ 100'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {members.map(m => {
                    const pct   = Number(pctConfig[m.id] || 0)
                    const share = amount ? round2((pct / 100) * parseFloat(amount)) : 0
                    return (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: pct > 0 ? 'var(--accent-dim)' : 'var(--bg3)',
                        border: `0.5px solid ${pct > 0 ? 'var(--accent)' : 'transparent'}`,
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0 }}>
                          {m.full_name || 'Unknown'}
                          {m.id === user.id && <span style={{ color: 'var(--text3)', fontSize: 12 }}> (you)</span>}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {amount && pct > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginRight: 4 }}>
                              ${share.toFixed(2)}
                            </span>
                          )}
                          <input
                            type="number" inputMode="decimal" min="0" max="100" step="1"
                            value={pctConfig[m.id] ?? 0}
                            onChange={e => setPctConfig(prev => ({ ...prev, [m.id]: parseFloat(e.target.value) || 0 }))}
                            style={{
                              width: 56, padding: '6px 8px', borderRadius: 8, textAlign: 'right',
                              background: 'var(--bg)', border: '0.5px solid var(--border2)',
                              fontSize: 14, fontWeight: 700, color: 'var(--text)',
                              fontFamily: 'Inter, sans-serif',
                            }}
                          />
                          <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600 }}>%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {Math.abs(pctTotal - 100) >= 0.5 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)', textAlign: 'center' }}>
                    Percentages must add up to 100% (currently {round2(pctTotal)}%)
                  </div>
                )}
              </div>
            )}

            {/* ── SHARES ── */}
            {splitType === 'shares' && (
              <div className="input-wrap" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="input-label" style={{ marginBottom: 0 }}>Shares each</label>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
                    {sharesTotal} total share{sharesTotal !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {members.map(m => {
                    const sh        = Number(shareConfig[m.id] || 0)
                    const sharePct  = sharesTotal ? round2((sh / sharesTotal) * 100) : 0
                    const shareDollar = amount && sharesTotal ? round2((sh / sharesTotal) * parseFloat(amount)) : 0
                    return (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: sh > 0 ? 'var(--accent-dim)' : 'var(--bg3)',
                        border: `0.5px solid ${sh > 0 ? 'var(--accent)' : 'transparent'}`,
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>
                            {m.full_name || 'Unknown'}
                            {m.id === user.id && <span style={{ color: 'var(--text3)', fontSize: 12 }}> (you)</span>}
                          </div>
                          {sh > 0 && sharesTotal > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                              {sharePct}%{amount ? ` · $${shareDollar.toFixed(2)}` : ''}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => setShareConfig(prev => ({ ...prev, [m.id]: Math.max(0, (Number(prev[m.id]) || 0) - 1) }))}
                            style={{ width: 28, height: 28, borderRadius: 8, border: '0.5px solid var(--border2)', background: 'var(--bg)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>−</button>
                          <input
                            type="number" inputMode="numeric" min="0"
                            value={shareConfig[m.id] ?? 1}
                            onChange={e => setShareConfig(prev => ({ ...prev, [m.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                            style={{
                              width: 40, padding: '6px 4px', borderRadius: 8, textAlign: 'center',
                              background: 'var(--bg)', border: '0.5px solid var(--border2)',
                              fontSize: 14, fontWeight: 700, color: 'var(--text)',
                              fontFamily: 'Inter, sans-serif',
                            }}
                          />
                          <button onClick={() => setShareConfig(prev => ({ ...prev, [m.id]: (Number(prev[m.id]) || 0) + 1 }))}
                            style={{ width: 28, height: 28, borderRadius: 8, border: '0.5px solid var(--border2)', background: 'var(--bg)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {amount && sharesTotal > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                    Proportional split across {sharesTotal} share{sharesTotal !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

            <button className="btn btn-primary" disabled={!canSubmit() || saving} onClick={addExpense}>
              {saving ? 'Saving…' : editingExpense ? 'Save Changes' : '+ Add Expense'}
            </button>
          </div>
        </div>
      )}

      {/* ── Settle-up Modal ── */}
      {settling && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setSettling(null) }}>
          <div style={{
            background: 'var(--bg)', borderRadius: '20px 20px 0 0',
            padding: '24px 20px calc(28px + env(safe-area-inset-bottom))',
            width: '100%', maxWidth: 430, margin: '0 auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Settle up 🤝</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSettling(null)}>✕</button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
              Recording payment from{' '}
              <strong style={{ color: 'var(--text)' }}>you</strong>
              {' '}to{' '}
              <strong style={{ color: 'var(--text)' }}>{memberName(settling.to)}</strong>
              {' '}(outstanding: ${settling.amount.toFixed(2)})
            </div>

            {/* Custom amount */}
            <div className="input-wrap">
              <label className="input-label">Amount (A$)</label>
              <input className="input" type="number" inputMode="decimal" min="0.01" step="0.01"
                value={settleAmount}
                onChange={e => setSettleAmount(e.target.value)} />
            </div>

            {/* Proof image */}
            <div className="input-wrap">
              <label className="input-label">Proof of payment (optional)</label>
              <input ref={settleFileInputRef} type="file" accept="image/*"
                style={{ display: 'none' }} onChange={handleSettleImagePick} />
              {settleImagePreview ? (
                <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '0.5px solid var(--border2)' }}>
                  <img src={settleImagePreview} alt="Proof" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                  <button onClick={removeSettleImage} style={{
                    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', fontSize: 14,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ) : (
                <button onClick={() => settleFileInputRef.current?.click()} style={{
                  width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)',
                  border: '1.5px dashed var(--border2)', background: 'var(--bg3)',
                  color: 'var(--text3)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  📷 Add payment screenshot
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSettling(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }}
                disabled={!settleAmount || parseFloat(settleAmount) <= 0 || saving}
                onClick={confirmSettle}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <GroupNav clubId={clubId} isMod={userRole === 'moderator'} activeTab="splits" />
    </div>
  )
}

// ── Thin balance row ─────────────────────────────────────────────
function BalanceRow({ d, last, fromLabel, fromColor, toLabel, toColor, amtColor, onSettle, settling, fromAvatar, toAvatar, bordered }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      borderTop: bordered ? '0.5px solid var(--border)' : undefined,
      borderBottom: last ? 'none' : '0.5px solid var(--border)',
    }}>
      {/* Stacked mini avatars */}
      <div style={{ position: 'relative', width: 34, height: 22, flexShrink: 0 }}>
        <div style={{ position: 'absolute', left: 0, top: 0 }}>
          <Avatar name={fromLabel} url={fromAvatar} size={22} />
        </div>
        <div style={{ position: 'absolute', left: 12, top: 0, outline: '1.5px solid var(--bg2)', borderRadius: '50%' }}>
          <Avatar name={toLabel} url={toAvatar} size={22} />
        </div>
      </div>

      {/* Names */}
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text2)' }}>
        <span style={{ color: fromColor }}>{fromLabel}</span>
        <span style={{ color: 'var(--text3)' }}> → </span>
        <span style={{ color: toColor }}>{toLabel}</span>
      </div>

      {/* Amount */}
      <div style={{ fontSize: 13, color: amtColor, flexShrink: 0, minWidth: 52, textAlign: 'right' }}>
        ${d.amount.toFixed(2)}
      </div>

      {/* Settle pill */}
      {onSettle && (
        <button onClick={onSettle} disabled={settling} style={{
          padding: '4px 10px', borderRadius: 99, fontSize: 11,
          border: 'none', background: 'var(--accent)', color: '#fff',
          cursor: 'pointer', flexShrink: 0,
        }}>Settle</button>
      )}
    </div>
  )
}

function Avatar({ name, url, size = 32, border = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      background: 'var(--accent-dim)', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: border ? '2px solid var(--bg)' : 'none',
    }}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.42, fontWeight: 700, color: 'var(--accent)' }}>
            {(name || '?')[0].toUpperCase()}
          </span>
      }
    </div>
  )
}
