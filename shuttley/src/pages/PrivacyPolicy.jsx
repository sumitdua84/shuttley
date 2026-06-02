export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '0 0 60px' }}>

      {/* Header */}
      <div style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16
      }}>
        <a href="/" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Shuttley</a>
        <span style={{ color: 'var(--border2)' }}>|</span>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Privacy Policy</span>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>

        <h1 style={{ fontSize: 28, fontFamily: 'var(--font-brand)', fontWeight: 800, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 40 }}>
          Last updated: {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        {[
          {
            title: '1. Who We Are',
            body: `Shuttley ("we", "our", "us") is a badminton club management platform operated by Shuttley (shuttley.club). We help badminton clubs manage sessions, track matches, and organise members. You can contact us at contact@shuttley.club.`
          },
          {
            title: '2. What Data We Collect',
            body: `When you sign in with Google, we receive your name, email address, and profile photo from your Google account. We store match results, session records, and club membership information that you or your club moderator creates within the app. We do not collect payment details, location data, or any sensitive personal information.`
          },
          {
            title: '3. How We Use Your Data',
            body: `We use your data solely to operate the Shuttley service — to display your profile, record your match history, and manage your club memberships. We do not sell, rent, or share your personal data with third parties for marketing purposes.`
          },
          {
            title: '4. Google Sign-In',
            body: `Shuttley uses Google OAuth for authentication. We only request your basic profile information (name, email, profile picture). We do not request access to your Google Drive, Gmail, Calendar, or any other Google services. Your Google password is never seen or stored by Shuttley.`
          },
          {
            title: '5. Data Storage',
            body: `Your data is stored securely on Supabase (PostgreSQL), hosted on AWS infrastructure. All data is encrypted in transit (HTTPS/TLS) and at rest. Backups are taken regularly to prevent data loss.`
          },
          {
            title: '6. Data Sharing',
            body: `Within a club, your name and match statistics are visible to other approved club members and moderators. Your email address is not visible to other users. We do not share your data with third parties except as required to operate the service (Supabase for database hosting, Google for authentication).`
          },
          {
            title: '7. Data Retention & Deletion',
            body: `Your data is retained while your account is active. You may request deletion of your account and all associated data by emailing contact@shuttley.club. We will action deletion requests within 30 days.`
          },
          {
            title: '8. Cookies',
            body: `Shuttley uses only essential session cookies required for authentication. We do not use tracking cookies or third-party advertising cookies.`
          },
          {
            title: '9. Children\'s Privacy',
            body: `Shuttley is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us at contact@shuttley.club.`
          },
          {
            title: '10. Changes to This Policy',
            body: `We may update this Privacy Policy from time to time. We will notify users of significant changes by updating the "Last updated" date above. Continued use of the service after changes constitutes acceptance of the updated policy.`
          },
          {
            title: '11. Contact Us',
            body: `For any privacy-related questions or requests, please contact us at contact@shuttley.club.`
          },
        ].map(({ title, body }) => (
          <div key={title} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{title}</h2>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8 }}>{body}</p>
          </div>
        ))}

      </div>
    </div>
  )
}
