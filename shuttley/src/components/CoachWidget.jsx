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
          0%, 100% { box-shadow: 0 4px 14px rgba(37,101,117,0.45); }
          50%       { box-shadow: 0 4px 26px rgba(37,101,117,0.75), 0 0 0 10px rgba(37,101,117,0.12); }
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
            background: 'var(--accent, #256575)',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            boxShadow: '0 4px 16px rgba(37,101,117,0.5)',
            zIndex: 900,
            animation: 'coachBounce 3s ease-in-out infinite',
          }}
        >
          {/* Stick robot SVG */}
          <svg viewBox="0 0 80 95" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            {/* Antenna */}
            <line x1="40" y1="6" x2="40" y2="1" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="40" cy="1" r="2.5" fill="rgba(255,255,255,0.9)"/>

            {/* Head */}
            <circle cx="40" cy="18" r="13" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="2"/>

            {/* Eyes */}
            <circle cx="35" cy="16" r="3" fill="white"/>
            <circle cx="45" cy="16" r="3" fill="white"/>
            <circle cx="36" cy="17" r="1.5" fill="rgba(37,101,117,1)"/>
            <circle cx="46" cy="17" r="1.5" fill="rgba(37,101,117,1)"/>
            {/* Eye shine */}
            <circle cx="36.8" cy="16" r="0.7" fill="white"/>
            <circle cx="46.8" cy="16" r="0.7" fill="white"/>

            {/* Smile */}
            <path d="M35 23 Q40 27.5 45 23" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round"/>

            {/* Body */}
            <rect x="29" y="32" width="22" height="24" rx="4" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="2"/>
            {/* Chest dot */}
            <circle cx="40" cy="44" r="3" fill="rgba(255,255,255,0.7)"/>

            {/* Left arm — static */}
            <line x1="29" y1="37" x2="16" y2="52" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="15" cy="53" r="3" fill="rgba(255,255,255,0.9)"/>

            {/* Right arm + racket — animated swing around shoulder (51, 37) */}
            <g>
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="-40 51 37; 25 51 37; -40 51 37"
                keyTimes="0; 0.38; 1"
                dur="1.1s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.2 0 0.5 1; 0.5 0 0.8 1"
              />
              {/* Upper arm */}
              <line x1="51" y1="37" x2="64" y2="50" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
              {/* Hand */}
              <circle cx="65" cy="51" r="3" fill="rgba(255,255,255,0.9)"/>
              {/* Racket handle */}
              <line x1="65" y1="51" x2="71" y2="40" stroke="rgba(255,220,100,0.95)" strokeWidth="2.5" strokeLinecap="round"/>
              {/* Racket frame */}
              <ellipse cx="73" cy="33" rx="6" ry="8" fill="none" stroke="rgba(255,220,100,0.95)" strokeWidth="2" transform="rotate(15 73 33)"/>
              {/* Strings */}
              <line x1="68" y1="29" x2="70" y2="39" stroke="rgba(255,220,100,0.6)" strokeWidth="0.8"/>
              <line x1="72" y1="27" x2="74" y2="39" stroke="rgba(255,220,100,0.6)" strokeWidth="0.8"/>
              <line x1="68" y1="31" x2="78" y2="32" stroke="rgba(255,220,100,0.6)" strokeWidth="0.8"/>
              <line x1="67" y1="35" x2="78" y2="36" stroke="rgba(255,220,100,0.6)" strokeWidth="0.8"/>
            </g>

            {/* Legs */}
            <line x1="36" y1="56" x2="30" y2="78" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
            <line x1="44" y1="56" x2="50" y2="78" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
            {/* Feet */}
            <line x1="30" y1="78" x2="22" y2="80" stroke="rgba(255,255,255,0.9)" strokeWidth="3" strokeLinecap="round"/>
            <line x1="50" y1="78" x2="58" y2="80" stroke="rgba(255,255,255,0.9)" strokeWidth="3" strokeLinecap="round"/>

            {/* Thinking dots (above head) */}
            {isThinking && (<>
              <circle cx="58" cy="8" r="2.5" fill="rgba(255,200,50,0.9)">
                <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" begin="0s"/>
              </circle>
              <circle cx="65" cy="4" r="2" fill="rgba(255,200,50,0.7)">
                <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" begin="0.15s"/>
              </circle>
              <circle cx="71" cy="1" r="1.5" fill="rgba(255,200,50,0.5)">
                <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" begin="0.3s"/>
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
                <svg viewBox="0 0 80 95" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', padding: 4 }}>
                  <line x1="40" y1="6" x2="40" y2="1" stroke="#256575" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="40" cy="1" r="2.5" fill="#256575"/>
                  <circle cx="40" cy="18" r="13" fill="rgba(37,101,117,0.15)" stroke="#256575" strokeWidth="2"/>
                  <circle cx="35" cy="16" r="3" fill="#256575"/>
                  <circle cx="45" cy="16" r="3" fill="#256575"/>
                  <circle cx="36" cy="17" r="1.5" fill="white"/>
                  <circle cx="46" cy="17" r="1.5" fill="white"/>
                  <path d="M35 23 Q40 27.5 45 23" stroke="#256575" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                  <rect x="29" y="32" width="22" height="24" rx="4" fill="rgba(37,101,117,0.15)" stroke="#256575" strokeWidth="2"/>
                  <circle cx="40" cy="44" r="3" fill="#256575" opacity="0.5"/>
                  <line x1="29" y1="37" x2="16" y2="52" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
                  <circle cx="15" cy="53" r="3" fill="#256575"/>
                  <g>
                    <animateTransform attributeName="transform" type="rotate" values="-40 51 37; 25 51 37; -40 51 37" keyTimes="0; 0.38; 1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.2 0 0.5 1; 0.5 0 0.8 1"/>
                    <line x1="51" y1="37" x2="64" y2="50" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
                    <circle cx="65" cy="51" r="3" fill="#256575"/>
                    <line x1="65" y1="51" x2="71" y2="40" stroke="#c8a030" strokeWidth="2.5" strokeLinecap="round"/>
                    <ellipse cx="73" cy="33" rx="6" ry="8" fill="none" stroke="#c8a030" strokeWidth="2" transform="rotate(15 73 33)"/>
                  </g>
                  <line x1="36" y1="56" x2="30" y2="78" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
                  <line x1="44" y1="56" x2="50" y2="78" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
                  <line x1="30" y1="78" x2="22" y2="80" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="50" y1="78" x2="58" y2="80" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>
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
