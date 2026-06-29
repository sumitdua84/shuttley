import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

export default function StatsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [memberships, setMemberships] = useState([])
  const [myStats, setMyStats] = useState(null)
  const [statPeriod, setStatPeriod] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [user])

  async function fetchAll() {
    if (!user) return

    const [{ data: mems }, { data: mpRows }] = await Promise.all([
      supabase.from('memberships')
        .select('club_id, role, status, clubs(id, name)')
        .eq('user_id', user.id).eq('status', 'approved'),
      supabase.from('match_players')
        .select('match_id, side').eq('user_id', user.id),
    ])

    setMemberships(mems || [])

    if (!mpRows?.length) { setLoading(false); return }

    const { data: matchRows } = await supabase
      .from('matches').select('id, winner_side, played_at, club_id')
      .in('id', mpRows.map(r => r.match_id)).eq('status', 'confirmed')

    if (!matchRows?.length) { setLoading(false); return }

    const sideMap = Object.fromEntries(mpRows.map(r => [r.match_id, r.side]))
    const clubIds = [...new Set(matchRows.map(m => m.club_id))]
    const now = new Date()

    function calcRows(rows) {
      let wins = 0, losses = 0
      rows.forEach(m => { if (m.winner_side === sideMap[m.id]) wins++; else losses++ })
      const total = wins + losses
      return { wins, losses, total, pct: total > 0 ? Math.round(wins / total * 100) : 0 }
    }

    function buildPeriod(days) {
      const cutoff = days ? new Date(now.getTime() - days * 86400000) : null
      const rows = cutoff ? matchRows.filter(m => new Date(m.played_at) >= cutoff) : matchRows
      const recent = [...rows]
        .sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
        .slice(0, 5)
      return {
        overall: calcRows(rows),
        clubs: Object.fromEntries(clubIds.map(cid => [cid, calcRows(rows.filter(m => m.club_id === cid))])),
        form: recent.map(m => m.winner_side === sideMap[m.id] ? 'W' : 'L'),
      }
    }

    setMyStats({
      '15d': buildPeriod(15),
      '30d': buildPeriod(30),
      '60d': buildPeriod(60),
      'all': buildPeriod(null),
    })
    setLoading(false)
  }

  const clubNameMap = Object.fromEntries(memberships.map(m => [m.club_id, m.clubs?.name]))

  return (
    <div className="page">
      <div className="topnav">
        <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Stats
        </span>
        {myStats && (
          <div style={{ display: 'flex', gap: 3 }}>
            {[['15d', '15d'], ['30d', '30d'], ['60d', '60d'], ['All', 'all']].map(([lbl, key]) => (
              <button key={key} onClick={() => setStatPeriod(key)} style={{
                padding: '4px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                background: statPeriod === key ? '#256575' : 'transparent',
                color: statPeriod === key ? 'white' : 'var(--text3)',
                border: `1px solid ${statPeriod === key ? '#256575' : 'var(--border)'}`,
                cursor: 'pointer', fontFamily: "'Inter',sans-serif", transition: 'all 0.15s',
              }}>{lbl}</button>
            ))}
          </div>
        )}
      </div>

      <div className="content">
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
        ) : !myStats ? (
          <div className="empty">
            <div className="empty-icon">🏸</div>
            <p>No matches yet.<br />Play some matches to see your stats here.</p>
          </div>
        ) : (() => {
          const s = myStats[statPeriod]
          const clubEntries = Object.entries(s.clubs).filter(([, cs]) => cs.total > 0)

          return <>
            {/* ── Overall ── */}
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">Overall</div>
              {s.overall.total === 0 ? (
                <div style={{
                  background: 'var(--bg2)', border: '0.5px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '14px 16px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>No matches in this period</div>
                </div>
              ) : (
                <div style={{
                  background: 'var(--bg2)', border: '0.5px solid var(--border)',
                  borderLeft: '4px solid #256575', borderRadius: 'var(--radius)',
                  padding: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 28, fontWeight: 700, color: '#2a8c55' }}>{s.overall.wins}W</span>
                      <span style={{ fontSize: 18, color: 'var(--text3)', margin: '0 8px' }}>·</span>
                      <span style={{ fontSize: 28, fontWeight: 700, color: '#e05555' }}>{s.overall.losses}L</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: s.overall.pct >= 50 ? '#256575' : '#e05555' }}>
                        {s.overall.pct}%
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>win rate</div>
                    </div>
                  </div>

                  {s.form?.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginRight: 2 }}>Recent</span>
                      {s.form.map((r, i) => (
                        <span key={i} style={{
                          width: 24, height: 24, borderRadius: 5, fontSize: 11, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: r === 'W' ? 'rgba(42,140,85,0.12)' : 'rgba(224,85,85,0.12)',
                          color: r === 'W' ? '#2a8c55' : '#e05555',
                        }}>{r}</span>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {s.overall.total} match{s.overall.total !== 1 ? 'es' : ''} played
                  </div>
                </div>
              )}
            </div>

            {/* ── By group ── */}
            {clubEntries.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">{clubEntries.length > 1 ? 'By group' : 'Group'}</div>
                {clubEntries.map(([cid, cs]) => {
                  const mem = memberships.find(m => m.club_id === cid)
                  const isMod = mem?.role === 'moderator'
                  const cName = clubNameMap[cid] || 'Group'
                  return (
                    <div key={cid}
                      onClick={() => navigate(isMod ? `/club/${cid}/mod` : `/club/${cid}/member`)}
                      style={{
                        background: 'var(--bg2)', border: '0.5px solid var(--border)',
                        borderLeft: `4px solid ${isMod ? '#256575' : '#6ea6b4'}`,
                        borderRadius: 'var(--radius)', padding: '12px 16px',
                        marginBottom: 8, cursor: 'pointer',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{cName}</div>
                        <span style={{ fontSize: 16, color: 'var(--text3)' }}>›</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        <span style={{ color: '#2a8c55', fontWeight: 600 }}>{cs.wins}W</span>
                        {' · '}
                        <span style={{ color: '#e05555', fontWeight: 600 }}>{cs.losses}L</span>
                        {' · '}
                        <span style={{ color: cs.pct >= 50 ? '#256575' : '#e05555', fontWeight: 600 }}>{cs.pct}%</span>
                        {' · '}{cs.total} played
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        })()}
      </div>

      <BottomNav activeTab="stats" />
    </div>
  )
}
