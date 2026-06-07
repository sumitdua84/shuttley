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
          0%, 100% { box-shadow: 0 3px 14px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08); }
          50%       { box-shadow: 0 6px 24px rgba(37,101,117,0.25), 0 0 0 8px rgba(37,101,117,0.08); }
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
            background: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            padding: 8,
            boxShadow: '0 3px 14px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
            zIndex: 900,
            animation: 'coachBounce 3s ease-in-out infinite',
          }}
        >
          {/* Stick Robot SVG — dark green on white */}
          <svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>

            {/* Robot head */}
            <circle cx="40" cy="22" r="13" fill="rgba(37,101,117,0.07)" stroke="#256575" strokeWidth="2.4"/>

            {/* Eyes — white circles with dark green pupils */}
            <circle cx="35.5" cy="20" r="3.2" fill="white" stroke="#256575" strokeWidth="1.4"/>
            <circle cx="44.5" cy="20" r="3.2" fill="white" stroke="#256575" strokeWidth="1.4"/>
            <circle cx="36.2" cy="20.6" r="1.4" fill="#256575"/>
            <circle cx="45.2" cy="20.6" r="1.4" fill="#256575"/>

            {/* Smile */}
            <path d="M35.5 27 Q40 31 44.5 27" stroke="#256575" strokeWidth="1.8" fill="none" strokeLinecap="round"/>

            {/* Whistle at neck */}
            <circle cx="40" cy="37" r="2.5" fill="#c8a030"/>
            <line x1="42.5" y1="37" x2="46" y2="36" stroke="#c8a030" strokeWidth="1.5" strokeLinecap="round"/>

            {/* Body */}
            <rect x="30" y="40" width="20" height="21" rx="4" fill="rgba(37,101,117,0.07)" stroke="#256575" strokeWidth="2.3"/>
            {/* Chest dot */}
            <circle cx="40" cy="50.5" r="2.5" fill="#256575" opacity="0.3"/>

            {/* Left arm — static */}
            <line x1="30" y1="45" x2="17" y2="59" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="16" cy="60" r="3" fill="#256575"/>

            {/* Right arm + racket — animated around shoulder (50, 45) */}
            <g>
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="-38 50 45; 22 50 45; -38 50 45"
                keyTimes="0; 0.38; 1"
                dur="1.1s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0.2 0 0.5 1; 0.5 0 0.8 1"
              />
              <line x1="50" y1="45" x2="62" y2="58" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
              <circle cx="63" cy="59" r="3" fill="#256575"/>
              <line x1="63" y1="59" x2="69" y2="48" stroke="#c8a030" strokeWidth="2.5" strokeLinecap="round"/>
              <ellipse cx="71" cy="41" rx="6" ry="8" fill="none" stroke="#c8a030" strokeWidth="2" transform="rotate(15 71 41)"/>
              <line x1="66" y1="37" x2="68" y2="47" stroke="#c8a030" strokeWidth="0.9" opacity="0.55"/>
              <line x1="71" y1="35" x2="71" y2="48" stroke="#c8a030" strokeWidth="0.9" opacity="0.55"/>
              <line x1="66" y1="41" x2="76" y2="42" stroke="#c8a030" strokeWidth="0.9" opacity="0.55"/>
              <line x1="66" y1="45" x2="76" y2="46" stroke="#c8a030" strokeWidth="0.9" opacity="0.55"/>
            </g>

            {/* Legs */}
            <line x1="36" y1="61" x2="30" y2="80" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
            <line x1="44" y1="61" x2="50" y2="80" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
            {/* Feet */}
            <line x1="30" y1="80" x2="22" y2="82" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>
            <line x1="50" y1="80" x2="58" y2="82" stroke="#256575" strokeWidth="3" strokeLinecap="round"/>

            {/* Thinking dots */}
            {isThinking && (<>
              <circle cx="58" cy="8" r="2.5" fill="rgba(200,160,48,0.9)">
                <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" begin="0s"/>
              </circle>
              <circle cx="65" cy="4" r="2" fill="rgba(200,160,48,0.7)">
                <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" begin="0.15s"/>
              </circle>
              <circle cx="71" cy="1" r="1.5" fill="rgba(200,160,48,0.5)">
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
                <svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', padding: 3 }}>
                  {/* Head */}
                  <circle cx="40" cy="22" r="13" fill="rgba(37,101,117,0.1)" stroke="#256575" strokeWidth="2"/>
                  {/* Eyes */}
                  <circle cx="35.5" cy="20" r="3" fill="white" stroke="#256575" strokeWidth="1.2"/>
                  <circle cx="44.5" cy="20" r="3" fill="white" stroke="#256575" strokeWidth="1.2"/>
                  <circle cx="36.2" cy="20.6" r="1.4" fill="#256575"/>
                  <circle cx="45.2" cy="20.6" r="1.4" fill="#256575"/>
                  {/* Smile */}
                  <path d="M35.5 27 Q40 31 44.5 27" stroke="#256575" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                  {/* Whistle */}
                  <circle cx="40" cy="37" r="2.2" fill="#c8a030"/>
                  <line x1="42.2" y1="37" x2="46" y2="36" stroke="#c8a030" strokeWidth="1.4" strokeLinecap="round"/>
                  {/* Body */}
                  <rect x="30" y="40" width="20" height="21" rx="4" fill="rgba(37,101,117,0.1)" stroke="#256575" strokeWidth="2"/>
                  <circle cx="40" cy="50.5" r="2.2" fill="#256575" opacity="0.4"/>
                  {/* Left arm */}
                  <line x1="30" y1="45" x2="17" y2="59" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
                  <circle cx="16" cy="60" r="3" fill="#256575"/>
                  {/* Right arm animated */}
                  <g>
                    <animateTransform attributeName="transform" type="rotate" values="-38 50 45; 22 50 45; -38 50 45" keyTimes="0; 0.38; 1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.2 0 0.5 1; 0.5 0 0.8 1"/>
                    <line x1="50" y1="45" x2="62" y2="58" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
                    <circle cx="63" cy="59" r="3" fill="#256575"/>
                    <line x1="63" y1="59" x2="69" y2="48" stroke="#c8a030" strokeWidth="2.5" strokeLinecap="round"/>
                    <ellipse cx="71" cy="41" rx="6" ry="8" fill="none" stroke="#c8a030" strokeWidth="2" transform="rotate(15 71 41)"/>
                  </g>
                  {/* Legs */}
                  <line x1="36" y1="61" x2="30" y2="80" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
                  <line x1="44" y1="61" x2="50" y2="80" stroke="#256575" strokeWidth="3.5" strokeLinecap="round"/>
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
