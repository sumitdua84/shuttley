import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DeleteAccount() {
  const navigate = useNavigate()
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase
      .from('account_deletion_requests')
      .insert({ email: email.trim() })
    if (err) {
      setError('Something went wrong. Please email support@shuttley.club directly.')
      setLoading(false)
      return
    }
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ marginBottom: 32 }}>
        <img src="/logo.svg" alt="Shuttley" style={{ height: 40 }} onError={e => e.target.style.display='none'} />
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#256575', marginTop: 16 }}>Delete Account</h1>
        <p style={{ fontSize: 14, color: '#6ea6b4', marginTop: 8, lineHeight: 1.6 }}>
          To request deletion of your Shuttley account and all associated data, please submit the form below.
          We will process your request within 30 days.
        </p>
      </div>

      {submitted ? (
        <div style={{ background: '#f0faf4', border: '1px solid #3a9e5f', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#3a9e5f', marginBottom: 8 }}>Request Received</h2>
          <p style={{ fontSize: 14, color: '#256575', lineHeight: 1.6 }}>
            Your account deletion request has been received. We will delete your account and all associated data within 30 days.
            You will receive a confirmation email at the address provided.
          </p>
          <button onClick={() => navigate('/')} style={{
            marginTop: 20, padding: '10px 24px', background: '#256575', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
          }}>Back to App</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6ea6b4', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
              Email Address
            </label>
            <input
              type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Enter your account email"
              style={{ width: '100%', padding: '12px 14px', background: '#f4f7fa', border: '0.5px solid rgba(37,101,117,0.22)', borderRadius: 8, fontSize: 15, color: '#256575', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 20, background: '#fff8f0', border: '1px solid rgba(224,85,85,0.2)', borderRadius: 8, padding: 16 }}>
            <p style={{ fontSize: 13, color: '#e05555', fontWeight: 600, marginBottom: 4 }}>⚠️ This action cannot be undone</p>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
              Deleting your account will permanently remove:
            </p>
            <ul style={{ fontSize: 13, color: '#666', marginTop: 6, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Your profile and personal information</li>
              <li>Your match history and statistics</li>
              <li>Your club memberships</li>
              <li>Your chat messages</li>
            </ul>
          </div>

          {error && (
            <div style={{ background: '#fff0f0', border: '1px solid #e05555', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#e05555' }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px', background: '#e05555', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
            opacity: loading ? 0.7 : 1
          }}>
            {loading ? 'Submitting…' : 'Request Account Deletion'}
          </button>

          <button type="button" onClick={() => navigate('/')} style={{
            width: '100%', padding: '14px', background: 'transparent', color: '#6ea6b4',
            border: '0.5px solid rgba(37,101,117,0.22)', borderRadius: 8, fontSize: 15,
            fontWeight: 500, cursor: 'pointer', marginTop: 8
          }}>
            Cancel
          </button>
        </form>
      )}

      <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 32 }}>
        For questions, contact <a href="mailto:support@shuttley.club" style={{ color: '#256575' }}>support@shuttley.club</a>
      </p>
    </div>
  )
}
