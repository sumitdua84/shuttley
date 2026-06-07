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
          50%       { transform: translateY(-6px) scale(1.06); }
        }
        @keyframes coachPulse {
          0%, 100% { box-shadow: 0 4px 14px rgba(37,101,117,0.45); }
          50%       { box-shadow: 0 4px 26px rgba(37,101,117,0.75), 0 0 0 8px rgba(37,101,117,0.12); }
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

      {/* ── Floating Button (hidden while panel is open) ─────────────────── */}
      {!isOpen && (
        <button
          onClick={openCoach}
          aria-label="Open Shuttley Coach"
          style={{
            position: 'fixed',
            bottom: 'calc(88px + env(safe-area-inset-bottom))',
            right: 18,
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: 'var(--accent, #256575)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            boxShadow: '0 4px 14px rgba(37,101,117,0.45)',
            zIndex: 900,
            animation: 'coachBounce 3.5s ease-in-out infinite',
          }}
        >
          🏸
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
                fontSize: 20,
                flexShrink: 0,
              }}>🏸</div>

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
