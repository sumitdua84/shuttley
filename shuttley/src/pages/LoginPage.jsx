import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signInWithGoogle } = useAuth()
  const [installPrompt, setInstallPrompt] = useState(null)
  const [iosHint, setIosHint]   = useState(null) // 'safari' | 'chrome' | 'other'
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
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

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 28px',
      background: '#ffffff',
    }}>

      {/* Logo */}
      <img
        src="/logo-source.png"
        alt="Shuttley"
        style={{
          width: 220, height: 220,
          display: 'block',
          marginBottom: 48,
        }}
      />

      {/* Android install banner */}
      {!installed && installPrompt && (
        <button onClick={handleInstall} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          width: '100%', padding: '14px 24px', borderRadius: 12,
          background: '#fff', color: '#256575',
          border: '1.5px solid #256575', fontSize: 15, fontWeight: 600,
          cursor: 'pointer', marginBottom: 16,
          boxShadow: '0 2px 12px rgba(37,101,117,0.12)',
        }}>
          Add to Home Screen
        </button>
      )}

      {/* iOS install hint */}
      {!installed && iosHint && (
        <div style={{
          width: '100%', marginBottom: 16,
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #256575',
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#256575', marginBottom: 6 }}>
            Add Shuttley to Home Screen
          </div>
          {iosHint === 'safari' && (
            <div style={{ fontSize: 12, color: '#256575', lineHeight: 1.7 }}>
              Tap <span style={{ fontWeight: 600 }}>Share ⎦↑</span> at the bottom of Safari,
              then <span style={{ fontWeight: 600 }}>Add to Home Screen</span>
            </div>
          )}
          {iosHint === 'chrome' && (
            <div style={{ fontSize: 12, color: '#256575', lineHeight: 1.7 }}>
              Tap <span style={{ fontWeight: 600 }}>⋯</span> at the bottom,
              then <span style={{ fontWeight: 600 }}>Add to Home Screen</span>
              <div style={{ marginTop: 5, opacity: 0.6 }}>Tip: Safari gives the best experience on iPhone</div>
            </div>
          )}
          {iosHint === 'other' && (
            <div style={{ fontSize: 12, color: '#256575', lineHeight: 1.7 }}>
              Open in <span style={{ fontWeight: 600 }}>Safari</span>,
              tap <span style={{ fontWeight: 600 }}>Share ⎦↑</span>,
              then <span style={{ fontWeight: 600 }}>Add to Home Screen</span>
            </div>
          )}
        </div>
      )}

      {/* Sign in */}
      <button onClick={signInWithGoogle} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        width: '100%', padding: '14px 24px', borderRadius: 12,
        background: '#fff', color: '#256575',
        border: '1.5px solid #256575', fontSize: 15, fontWeight: 600,
        cursor: 'pointer', marginBottom: 20,
        boxShadow: '0 2px 12px rgba(37,101,117,0.12)',
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
          <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      {/* Legal */}
      <p style={{ fontSize: 11, color: '#6ea6b4', textAlign: 'center', lineHeight: 1.9 }}>
        By continuing you agree to Shuttley's{' '}
        <a href="/terms" style={{ color: '#256575', textDecoration: 'underline' }}>Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" style={{ color: '#256575', textDecoration: 'underline' }}>Privacy Policy</a>
      </p>

    </div>
  )
}
