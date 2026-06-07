import { useState, useRef, useEffect } from 'react'
import { useCoach } from '../hooks/useCoach'

export default function CoachWidget() {
  const {
    isOpen, openCoach, closeCoach,
    messages, isThinking,
    coachEnabled, sendMessage, error,
  } = useCoach()

  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Clear input when panel closes
  useEffect(() => {
    if (!isOpen) setInputText('')
  }, [isOpen])

  if (!coachEnabled) return null

  function handleSend() {
    if (!inputText.trim() || isThinking) return
    sendMessage(inputText.trim())
    setInputText('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* ── CSS Animations ───────────────────────────────────────────────── */}
      <style>{`
        @keyframes coachBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-7px) scale(1.04); }
        }
        @keyframes coachPulse {
          0%, 100% { filter: drop-shadow(0 2px 6px rgba(37,101,117,0.25)); }
          50%       { filter: drop-shadow(0 4px 14px rgba(37,101,117,0.45)); }
        }
        @keyframes coachSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes coachFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0);   opacity: 0.35; }
          40%            { transform: translateY(-7px); opacity: 1; }
        }
      `}</style>

      {/* ── Floating Robot Button ────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={openCoach}
          aria-label="Open Shuttley Coach"
          style={{
            position: 'fixed',
            bottom: 'calc(88px + env(safe-area-inset-bottom))',
            right: 14,
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            filter: 'drop-shadow(0 2px 6px rgba(37,101,117,0.3))',
            zIndex: 900,
            animation: 'coachBounce 3s ease-in-out infinite',
          }}
        >
          {/* Robot SVG — square face, teal, transparent bg */}
          <svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>

            {/* Antenna */}
            <line x1="40" y1="8" x2="40" y2="3" stroke="#256575" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="40" cy="2.5" r="2.5" fill="#256575"/>

            {/* Square robot head */}
            <rect x="24" y="9" width="32" height="26" rx="4" fill="rgba(37,101,117,0.08)" stroke="#256575" strokeWidth="2.3"/>
            {/* Face panel */}
            <rect x="28" y="12" width="24" height="18" rx="2" fill="rgba(37,101,117,0.05)" stroke="#256575" strokeWidth="0.7" opacity="0.5"/>

            {/* Square eyes */}
            <rect x="30" y="15" width="8" height="7" rx="1.5" fill="white" stroke="#256575" strokeWidth="1.3"/>
            <rect x="42" y="15" width="8" height="7" rx="1.5" fill="white" stroke="#256575" strokeWidth="1.3"/>
            {/* Pupils */}
            <rect x="32.5" y="17" width="3" height="3" rx="0.8" fill="#256575"/>
            <rect x="44.5" y="17" width="3" height="3" rx="0.8" fill="#256575"/>

            {/* LED-segment mouth */}
            <rect x="30" y="25" width="4" height="2.5" rx="0.5" fill="#256575"/>
            <rect x="36" y="25" width="4" height="2.5" rx="0.5" fill="#256575" opacity="0.35"/>
            <rect x="42" y="25" width="4" height="2.5" rx="0.5" fill="#256575" opacity="0.75"/>
            <rect x="48" y="25" width="3" height="2.5" rx="0.5" fill="#256575" opacity="0.25"/>

            {/* Neck */}
            <line x1="40" y1="35" x2="40" y2="40" stroke="#256575" strokeWidth="2.8" strokeLinecap="round"/>

            {/* Body */}
            <rect x="29" y="40" width="22" height="21" rx="4" fill="rgba(37,101,117,0.07)" stroke="#256575" strokeWidth="2.2"/>
            {/* Chest panel */}
            <rect x="33" y="44" width="14" height="9" rx="2" fill="rgba(37,101,117,0.1)" stroke="#256575" strokeWidth="0.7" opacity="0.7"/>
            <circle cx="37" cy="48.5" r="1.5" fill="#256575" opacity="0.5"/>
            <circle cx="43" cy="48.5" r="1.5" fill="#256575" opacity="0.3"/>

            {/* Left arm — static */}
            <line x1="29" y1="46" x2="16" y2="59" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
            <circle cx="15.5" cy="59.5" r="2.8" fill="#256575"/>

            {/* Right arm + teal racket — animated */}
            <g>
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="-38 51 46; 22 51 46; -38 51 46"
                keyTimes="0; 0.38; 1"
                dur="1.1s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.2 0 0.5 1; 0.5 0 0.8 1"
              />
              <line x1="51" y1="46" x2="63" y2="58" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
              <circle cx="63.5" cy="58.5" r="2.8" fill="#256575"/>
              <line x1="63.5" y1="58.5" x2="69" y2="48" stroke="#256575" strokeWidth="2.5" strokeLinecap="round"/>
              <ellipse cx="71" cy="41" rx="6.5" ry="8" fill="none" stroke="#256575" strokeWidth="2.2" transform="rotate(14 71 41)"/>
              <line x1="66" y1="37" x2="68" y2="47" stroke="#256575" strokeWidth="0.9" opacity="0.4"/>
              <line x1="71" y1="35" x2="71" y2="48" stroke="#256575" strokeWidth="0.9" opacity="0.4"/>
              <line x1="66" y1="41" x2="76" y2="42" stroke="#256575" strokeWidth="0.9" opacity="0.4"/>
              <line x1="66" y1="45" x2="76" y2="46" stroke="#256575" strokeWidth="0.9" opacity="0.4"/>
            </g>

            {/* Legs */}
            <line x1="36" y1="61" x2="30" y2="80" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
            <line x1="44" y1="61" x2="50" y2="80" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
            {/* Feet */}
            <line x1="30" y1="80" x2="22" y2="82" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>
            <line x1="50" y1="80" x2="58" y2="82" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>

            {/* Thinking dots */}
            {isThinking && (<>
              <circle cx="60" cy="6" r="2.5" fill="#256575" opacity="0.7">
                <animate attributeName="opacity" values="0.7;0.15;0.7" dur="0.7s" repeatCount="indefinite" begin="0s"/>
              </circle>
              <circle cx="67" cy="3" r="2" fill="#256575" opacity="0.5">
                <animate attributeName="opacity" values="0.5;0.1;0.5" dur="0.7s" repeatCount="indefinite" begin="0.15s"/>
              </circle>
              <circle cx="73" cy="1" r="1.5" fill="#256575" opacity="0.35">
                <animate attributeName="opacity" values="0.35;0.07;0.35" dur="0.7s" repeatCount="indefinite" begin="0.3s"/>
              </circle>
            </>)}
          </svg>
        </button>
      )}

      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeCoach}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              zIndex: 910,
              animation: 'coachFadeIn 0.2s ease-out',
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              height: '70vh',
              background: 'var(--bg, #ffffff)',
              borderRadius: '20px 20px 0 0',
              zIndex: 920,
              display: 'flex',
              flexDirection: 'column',
              animation: 'coachSlideUp 0.3s ease-out',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              borderBottom: '0.5px solid var(--border, rgba(0,0,0,0.1))',
              flexShrink: 0,
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--accent-dim, rgba(37,101,117,0.1))',
                border: '2px solid var(--accent, #256575)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                <svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', padding: 2 }}>
                  {/* Antenna */}
                  <line x1="40" y1="8" x2="40" y2="3" stroke="#256575" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="40" cy="2.5" r="2.5" fill="#256575"/>
                  {/* Square robot head */}
                  <rect x="24" y="9" width="32" height="26" rx="4" fill="rgba(37,101,117,0.1)" stroke="#256575" strokeWidth="2.2"/>
                  {/* Square eyes */}
                  <rect x="30" y="15" width="8" height="7" rx="1.5" fill="white" stroke="#256575" strokeWidth="1.2"/>
                  <rect x="42" y="15" width="8" height="7" rx="1.5" fill="white" stroke="#256575" strokeWidth="1.2"/>
                  <rect x="32.5" y="17" width="3" height="3" rx="0.8" fill="#256575"/>
                  <rect x="44.5" y="17" width="3" height="3" rx="0.8" fill="#256575"/>
                  {/* LED mouth */}
                  <rect x="30" y="25" width="4" height="2.5" rx="0.5" fill="#256575"/>
                  <rect x="36" y="25" width="4" height="2.5" rx="0.5" fill="#256575" opacity="0.35"/>
                  <rect x="42" y="25" width="4" height="2.5" rx="0.5" fill="#256575" opacity="0.75"/>
                  <rect x="48" y="25" width="3" height="2.5" rx="0.5" fill="#256575" opacity="0.25"/>
                  {/* Neck */}
                  <line x1="40" y1="35" x2="40" y2="40" stroke="#256575" strokeWidth="2.8" strokeLinecap="round"/>
                  {/* Body */}
                  <rect x="29" y="40" width="22" height="21" rx="4" fill="rgba(37,101,117,0.08)" stroke="#256575" strokeWidth="2"/>
                  <rect x="33" y="44" width="14" height="9" rx="2" fill="rgba(37,101,117,0.1)" stroke="#256575" strokeWidth="0.7" opacity="0.7"/>
                  <circle cx="37" cy="48.5" r="1.5" fill="#256575" opacity="0.5"/>
                  <circle cx="43" cy="48.5" r="1.5" fill="#256575" opacity="0.3"/>
                  {/* Left arm */}
                  <line x1="29" y1="46" x2="16" y2="59" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
                  <circle cx="15.5" cy="59.5" r="2.8" fill="#256575"/>
                  {/* Right arm animated */}
                  <g>
                    <animateTransform attributeName="transform" type="rotate" values="-38 51 46; 22 51 46; -38 51 46" keyTimes="0; 0.38; 1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.2 0 0.5 1; 0.5 0 0.8 1"/>
                    <line x1="51" y1="46" x2="63" y2="58" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
                    <circle cx="63.5" cy="58.5" r="2.8" fill="#256575"/>
                    <line x1="63.5" y1="58.5" x2="69" y2="48" stroke="#256575" strokeWidth="2.5" strokeLinecap="round"/>
                    <ellipse cx="71" cy="41" rx="6.5" ry="8" fill="none" stroke="#256575" strokeWidth="2.2" transform="rotate(14 71 41)"/>
                  </g>
                  {/* Legs */}
                  <line x1="36" y1="61" x2="30" y2="80" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
                  <line x1="44" y1="61" x2="50" y2="80" stroke="#256575" strokeWidth="3.4" strokeLinecap="round"/>
                  <line x1="30" y1="80" x2="22" y2="82" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="50" y1="80" x2="58" y2="82" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--text, #1a1a1a)',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  Shuttley Coach
                </div>
                <div style={{
                  fontSize: 11,
                  color: isThinking ? '#ffc832' : 'var(--accent, #256575)',
                  fontWeight: 600,
                  marginTop: 1,
                }}>
                  {isThinking ? '● thinking…' : '● ready'}
                </div>
              </div>

              <button
                onClick={closeCoach}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text3, #aaa)',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  lineHeight: 1,
                  borderRadius: 8,
                }}
              >✕</button>
            </div>

            {/* ── Messages ── */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 16px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {messages.length === 0 && !isThinking && (
                <div style={{
                  textAlign: 'center',
                  color: 'var(--text3, #aaa)',
                  fontSize: 13,
                  marginTop: 24,
                }}>
                  Starting your session…
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    maxWidth: '82%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user'
                      ? '18px 18px 4px 18px'
                      : '4px 18px 18px 18px',
                    background: msg.role === 'user'
                      ? 'var(--accent, #256575)'
                      : 'var(--bg2, #f2f2f2)',
                    color: msg.role === 'user'
                      ? '#ffffff'
                      : 'var(--text, #1a1a1a)',
                    fontSize: 14,
                    lineHeight: 1.55,
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Thinking dots */}
              {isThinking && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    padding: '12px 16px',
                    background: 'var(--bg2, #f2f2f2)',
                    borderRadius: '4px 18px 18px 18px',
                    display: 'flex',
                    gap: 5,
                    alignItems: 'center',
                  }}>
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'var(--accent, #256575)',
                          animation: `dotBounce 1.2s ease-in-out ${i * 0.18}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#e05555',
                  padding: '4px 0',
                }}>
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input bar ── */}
            <div style={{
              display: 'flex',
              gap: 8,
              padding: '10px 14px',
              paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
              borderTop: '0.5px solid var(--border, rgba(0,0,0,0.1))',
              background: 'var(--bg, #ffffff)',
              flexShrink: 0,
              alignItems: 'center',
            }}>
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your coach…"
                disabled={isThinking}
                autoFocus
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 24,
                  border: '1.5px solid var(--border2, rgba(0,0,0,0.15))',
                  background: 'var(--bg2, #f2f2f2)',
                  color: 'var(--text, #1a1a1a)',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: "'Inter', sans-serif",
                  opacity: isThinking ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isThinking}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: inputText.trim() && !isThinking
                    ? 'var(--accent, #256575)'
                    : 'var(--bg3, #e0e0e0)',
                  border: 'none',
                  cursor: inputText.trim() && !isThinking ? 'pointer' : 'default',
                  fontSize: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.2s',
                  color: inputText.trim() && !isThinking ? '#fff' : 'var(--text3, #bbb)',
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
