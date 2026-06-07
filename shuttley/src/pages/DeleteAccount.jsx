import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function DeleteAccount() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [step, setStep] = useState('confirm') // confirm | deleting | done | error
  const [error, setError] = useState('')

  async function handleDelete() {
    if (!user) { setError('You must be logged in to delete your account.'); return }
    setStep('deleting')
    try {
      // Submit deletion request — server will assign the anonymised name from a sequence
      await supabase.from('account_deletion_requests').insert({
        email: user.email,
        user_id: user.id,
        status: 'pending',
      })

      // Sign out — app will block re-login with pending message
      await signOut()

      setStep('done')
    } catch (e) {
      setError(e.message || 'Something went wrong. Please contact support@shuttley.club')
      setStep('error')
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px', fontFamily: "'Inter', sans-serif" }}>

      <div style={{ marginBottom: 28 }}>
        <img src="/logo-source.png" alt="Shuttley" style={{ height: 48 }} onError={e => e.target.style.display = 'none'} />
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#256575', marginTop: 16 }}>Delete Account</h1>
      </div>

      {/* Not logged in */}
      {!user && step !== 'done' && (
        <div style={{ background: '#fff8f0', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 14, color: '#e05555', marginBottom: 16 }}>
            You need to be signed in to delete your account.
          </p>
          <button onClick={() => navigate('/login')} style={{ padding: '12px 24px', background: '#256575', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Sign In
          </button>
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 16 }}>
            Or email us at <a href="mailto:support@shuttley.club" style={{ color: '#256575' }}>support@shuttley.club</a> and we'll process your request within 30 days.
          </p>
        </div>
      )}

      {/* Confirm step */}
      {user && step === 'confirm' && (
        <>
          <div style={{ background: '#fff8f0', border: '1px solid rgba(224,85,85,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#e05555', marginBottom: 10 }}>⚠️ This action cannot be undone</p>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, marginBottom: 10 }}>
              Your account will be anonymised immediately. Here's what happens:
            </p>
            <ul style={{ fontSize: 13, color: '#555', paddingLeft: 20, lineHeight: 2 }}>
              <li>Your name will be changed to <strong style={{ color: '#256575' }}>deleted_xxxx</strong> to preserve other players' match stats</li>
              <li>Your profile photo and personal details will be removed</li>
              <li>You'll be removed from all clubs</li>
              <li>Your chat messages will be cleared</li>
            </ul>
          </div>

          <button
            onClick={handleDelete}
            style={{ width: '100%', padding: 14, background: '#e05555', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
            Yes, Delete My Account
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{ width: '100%', padding: 14, background: 'transparent', color: '#6ea6b4', border: '0.5px solid rgba(37,101,117,0.22)', borderRadius: 8, fontSize: 15, cursor: 'pointer' }}>
            Cancel
          </button>
        </>
      )}

      {/* Deleting */}
      {step === 'deleting' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
          <p style={{ fontSize: 16, color: '#256575', fontWeight: 600 }}>Deleting your account…</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div style={{ background: '#f0faf4', border: '1px solid #3a9e5f', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#3a9e5f', marginBottom: 8 }}>Account Deleted</h2>
          <p style={{ fontSize: 14, color: '#256575', lineHeight: 1.6 }}>
            Your deletion request has been submitted. Your account will be anonymised to <strong>deleted_xxxx</strong> to preserve other players' match history and stats. Personal data will be fully removed once an admin processes the request.
          </p>
          <button onClick={() => navigate('/login')} style={{ marginTop: 20, padding: '10px 24px', background: '#256575', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div style={{ background: '#fff0f0', border: '1px solid #e05555', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 14, color: '#e05555', marginBottom: 12 }}>{error}</p>
          <button onClick={() => setStep('confirm')} style={{ padding: '10px 20px', background: '#256575', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      )}

      <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 32 }}>
        Questions? <a href="mailto:support@shuttley.club" style={{ color: '#256575' }}>support@shuttley.club</a>
      </p>
    </div>
  )
}
