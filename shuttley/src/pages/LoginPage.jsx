import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()

  const [installPrompt, setInstallPrompt] = useState(null)
  const [iosHint, setIosHint]   = useState(null)
  const [installed, setInstalled] = useState(false)

  // view: 'main' | 'signup' | 'forgot'
  const [view, setView] = useState('main')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) { setInstalled(true); return }
    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    if (isIOS) {
      if      (/CriOS/i.test(ua))  setIosHint('chrome')
      else if (/FxiOS/i.test(ua))  setIosHint('other')
      else if (/EdgiOS/i.test(ua)) setIosHint('other')
      else                          setIosHint('safari')
    } else {
      const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
      window.addEventListener('beforeinstallprompt', handler)
      window.addEventListener('appinstalled', () => setInstalled(true))
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  function resetForm() { setEmail(''); setFirstName(''); setLastName(''); setPassword(''); setConfirmPassword(''); setError(''); setMessage('') }
  function switchView(v) { resetForm(); setView(v) }

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await signInWithEmail(email, password)
    setLoading(false)
    if (error) setError(error.message)
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (!firstName.trim()) { setError('Please enter your first name'); return }
    if (!lastName.trim()) { setError('Please enter your last name'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    const fullName = `${firstName.trim()} ${lastName.trim()}`
    const { error } = await signUpWithEmail(email, password, fullName)
    if (error) { setError(error.message); setLoading(false); return }
    setLoading(false)
    setMessage('Check your email for a confirmation link!')
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await resetPassword(email)
    setLoading(false)
    if (error) setError(error.message)
    else setMessage('Password reset link sent to your email!')
  }

  const inputStyle = {
    width: '100%', padding: '13px 14px', borderRadius: 10,
    border: '1.5px solid rgba(37,101,117,0.25)', fontSize: 15,
    color: '#256575', background: '#f4f7fa', outline: 'none',
    fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box',
  }

  const btnPrimary = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '14px 24px', borderRadius: 12,
    background: '#256575', color: '#fff',
    border: 'none', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', marginBottom: 12,
    boxShadow: '0 2px 12px rgba(37,101,117,0.2)',
    fontFamily: 'inherit',
  }

  const iconBtn = {
    width: 52, height: 52, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: '1.5px solid rgba(37,101,117,0.2)',
    background: '#fff', flexShrink: 0,
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'0 28px 40px', background:'#ffffff', maxWidth:430, margin:'0 auto', width:'100%' }}>

      {/* Logo — pushed toward top */}
      <img src="/logo-source.png" alt="Shuttley" style={{ width: view === 'main' ? 180 : 100, height: view === 'main' ? 180 : 100, display:'block', marginTop: view === 'main' ? 48 : 40, marginBottom: view === 'main' ? 24 : 20, transition:'all 0.2s' }} />

      {/* ── MAIN VIEW (Sign In) ── */}
      {view === 'main' && <>

        {/* iOS install hint */}
        {!installed && iosHint && (
          <div style={{ width:'100%', marginBottom:16, background:'#ffffff', borderRadius:14, border:'1px solid #256575', padding:'14px 16px' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#256575', marginBottom:6 }}>Add Shuttley to Home Screen</div>
            {iosHint === 'safari' && <div style={{ fontSize:12, color:'#256575', lineHeight:1.7 }}>Tap <strong>Share ⎦↑</strong> at the bottom of Safari, then <strong>Add to Home Screen</strong></div>}
            {iosHint === 'chrome' && <div style={{ fontSize:12, color:'#256575', lineHeight:1.7 }}>Tap <strong>⋯</strong> at the bottom, then <strong>Add to Home Screen</strong></div>}
            {iosHint === 'other'  && <div style={{ fontSize:12, color:'#256575', lineHeight:1.7 }}>Open in <strong>Safari</strong>, tap <strong>Share ⎦↑</strong>, then <strong>Add to Home Screen</strong></div>}
          </div>
        )}

        {/* Android install banner */}
        {!installed && installPrompt && (
          <button onClick={handleInstall} style={{ ...btnPrimary, marginBottom:16 }}>Add to Home Screen</button>
        )}

        <div style={{ fontSize:26, fontWeight:700, color:'#256575', marginBottom:6, alignSelf:'flex-start' }}>Sign In</div>
        <div style={{ fontSize:13, color:'#6ea6b4', marginBottom:20, alignSelf:'flex-start' }}>
          New to Shuttley?{' '}
          <span onClick={() => switchView('signup')} style={{ color:'#256575', fontWeight:600, cursor:'pointer', textDecoration:'underline' }}>
            Create an account
          </span>
        </div>

        <form onSubmit={handleSignIn} style={{ width:'100%' }}>
          <input style={inputStyle} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <div style={{ color:'#e05555', fontSize:13, marginBottom:10 }}>{error}</div>}
          <button type="submit" style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <button onClick={() => switchView('forgot')} style={{ background:'none', border:'none', color:'#6ea6b4', fontSize:13, cursor:'pointer', marginBottom:24, alignSelf:'flex-start' }}>
          Forgot password?
        </button>

        {/* Divider */}
        <div style={{ display:'flex', alignItems:'center', gap:12, width:'100%', marginBottom:20 }}>
          <div style={{ flex:1, height:1, background:'rgba(37,101,117,0.15)' }} />
          <span style={{ fontSize:12, color:'#6ea6b4', whiteSpace:'nowrap' }}>or sign in with</span>
          <div style={{ flex:1, height:1, background:'rgba(37,101,117,0.15)' }} />
        </div>

        {/* Social icon buttons */}
        <div style={{ display:'flex', gap:16, marginBottom:28 }}>
          {/* Google */}
          <button onClick={signInWithGoogle} style={iconBtn} title="Continue with Google">
            <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          </button>

          {/* Apple */}
          <button onClick={signInWithApple} style={{ ...iconBtn, background:'#000', border:'1.5px solid #000' }} title="Continue with Apple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          </button>
        </div>

        <p style={{ fontSize:11, color:'#6ea6b4', textAlign:'center', lineHeight:1.9 }}>
          By continuing you agree to Shuttley's{' '}
          <a href="/terms" style={{ color:'#256575', textDecoration:'underline' }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" style={{ color:'#256575', textDecoration:'underline' }}>Privacy Policy</a>
        </p>
      </>}

      {/* ── SIGN UP ── */}
      {view === 'signup' && <>
        <div style={{ fontSize:22, fontWeight:700, color:'#256575', marginBottom:6, alignSelf:'flex-start' }}>Create account</div>
        <div style={{ fontSize:13, color:'#6ea6b4', marginBottom:24, alignSelf:'flex-start' }}>Join Shuttley</div>
        {message
          ? <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:16 }}>📧</div>
              <div style={{ fontSize:15, color:'#256575', fontWeight:600, marginBottom:8 }}>Check your email!</div>
              <div style={{ fontSize:13, color:'#6ea6b4', marginBottom:24, lineHeight:1.6 }}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</div>
              <button onClick={() => switchView('main')} style={btnPrimary}>Back to Sign In</button>
            </div>
          : <form onSubmit={handleSignUp} style={{ width:'100%' }}>
              <input style={inputStyle} type="text" placeholder="First name *" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              <input style={inputStyle} type="text" placeholder="Last name *" value={lastName} onChange={e => setLastName(e.target.value)} required />
              <div style={{ fontSize:11, color:'#6ea6b4', marginTop:-8, marginBottom:12 }}>No last name? Type your first name again</div>
              <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
              <input style={inputStyle} type="password" placeholder="Password (min 6 characters)" value={password} onChange={e => setPassword(e.target.value)} required />
              <input style={inputStyle} type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              {error && <div style={{ color:'#e05555', fontSize:13, marginBottom:10 }}>{error}</div>}
              <button type="submit" style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
        }
        {!message && <button onClick={() => switchView('main')} style={{ background:'none', border:'none', color:'#256575', fontSize:13, fontWeight:600, cursor:'pointer' }}>← Back to Sign In</button>}
      </>}

      {/* ── FORGOT PASSWORD ── */}
      {view === 'forgot' && <>
        <div style={{ fontSize:22, fontWeight:700, color:'#256575', marginBottom:6, alignSelf:'flex-start' }}>Reset password</div>
        <div style={{ fontSize:13, color:'#6ea6b4', marginBottom:24, alignSelf:'flex-start' }}>We'll send you a reset link</div>
        {message
          ? <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:16 }}>📧</div>
              <div style={{ fontSize:15, color:'#256575', fontWeight:600, marginBottom:8 }}>Check your email!</div>
              <div style={{ fontSize:13, color:'#6ea6b4', marginBottom:24, lineHeight:1.6 }}>We sent a password reset link to <strong>{email}</strong>.</div>
              <button onClick={() => switchView('main')} style={btnPrimary}>Back to Sign In</button>
            </div>
          : <form onSubmit={handleForgot} style={{ width:'100%' }}>
              <input style={inputStyle} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
              {error && <div style={{ color:'#e05555', fontSize:13, marginBottom:10 }}>{error}</div>}
              <button type="submit" style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
        }
        {!message && <button onClick={() => switchView('main')} style={{ background:'none', border:'none', color:'#256575', fontSize:13, fontWeight:600, cursor:'pointer' }}>← Back to Sign In</button>}
      </>}

    </div>
  )
}
