import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signInWithGoogle } = useAuth()

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '32px 24px',
      background: 'var(--bg)'
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '64px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'var(--accent)', color: 'var(--bg)',
          fontFamily: "'DM Serif Display', serif",
          fontSize: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px'
        }}>S</div>
        <h1 style={{ fontSize: 38, color: 'var(--text)', letterSpacing: '-1px', marginBottom: 8 }}>
          Shuttley
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 15, lineHeight: 1.5 }}>
          Club management,<br />beautifully simple.
        </p>
      </div>

      {/* Features */}
      <div style={{ width: '100%', marginBottom: '48px' }}>
        {[
          ['🏸', 'Create or join any club'],
          ['📅', 'Manage session schedules'],
          ['✅', 'Approve members instantly'],
        ].map(([icon, text]) => (
          <div key={text} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 0', borderBottom: '0.5px solid var(--border)'
          }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 15, color: 'var(--text2)' }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Sign in button */}
      <button className="btn btn-primary" onClick={signInWithGoogle} style={{ marginBottom: 12 }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
          <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>
        By continuing, you agree to Shuttley's terms of service
      </p>
    </div>
  )
}
