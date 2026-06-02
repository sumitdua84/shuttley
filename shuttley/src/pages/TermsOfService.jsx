export default function TermsOfService() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '0 0 60px' }}>

      {/* Header */}
      <div style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16
      }}>
        <a href="/" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Shuttley</a>
        <span style={{ color: 'var(--border2)' }}>|</span>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Terms of Service</span>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>

        <h1 style={{ fontSize: 28, fontFamily: 'var(--font-brand)', fontWeight: 800, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
          Terms of Service
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 40 }}>
          Last updated: {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: `By accessing or using Shuttley ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. These terms apply to all users including club members, moderators, and administrators.`
          },
          {
            title: '2. Description of Service',
            body: `Shuttley is a badminton club management platform that allows clubs to manage sessions, record match results, track player statistics, and organise memberships. The Service is provided via shuttley.club and as a Progressive Web App (PWA).`
          },
          {
            title: '3. User Accounts',
            body: `You must sign in using a valid Google account to use Shuttley. You are responsible for maintaining the security of your account. You must not use another person's account or share your account credentials. You must provide accurate information when creating your profile.`
          },
          {
            title: '4. Acceptable Use',
            body: `You agree not to use the Service to harass, abuse, or harm other users; to post false or misleading information; to attempt to gain unauthorised access to any part of the Service; or to use the Service for any unlawful purpose. Club moderators are responsible for ensuring appropriate conduct within their clubs.`
          },
          {
            title: '5. Club Moderators',
            body: `Club moderators are responsible for managing their club's members, approving membership requests, and maintaining accurate session and match records. Moderators must not abuse their administrative privileges. Shuttley reserves the right to remove or demote moderators who violate these terms.`
          },
          {
            title: '6. Data and Content',
            body: `You retain ownership of any match data, session records, and club information you create in the Service. By using the Service, you grant Shuttley a licence to store and display this data to you and your club members as part of normal operation. You are responsible for the accuracy of data you enter.`
          },
          {
            title: '7. Service Availability',
            body: `We aim to keep Shuttley available at all times but cannot guarantee uninterrupted access. We may perform maintenance, updates, or experience downtime outside our control. We are not liable for any loss arising from service unavailability.`
          },
          {
            title: '8. Paid Plans',
            body: `Certain features of Shuttley may be available on a paid subscription basis. Billing terms and pricing will be clearly communicated before any charge is made. Subscriptions auto-renew unless cancelled. Refund requests should be directed to contact@shuttley.club and will be reviewed on a case-by-case basis.`
          },
          {
            title: '9. Limitation of Liability',
            body: `To the maximum extent permitted by law, Shuttley is not liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability for any claim shall not exceed the amount you paid us in the 12 months preceding the claim.`
          },
          {
            title: '10. Termination',
            body: `We reserve the right to suspend or terminate your account if you violate these Terms of Service. You may delete your account at any time by contacting contact@shuttley.club. Upon termination, your data will be retained for 30 days before deletion unless you request immediate removal.`
          },
          {
            title: '11. Changes to Terms',
            body: `We may update these Terms of Service from time to time. We will notify users of significant changes by updating the "Last updated" date above. Continued use of the Service after changes constitutes acceptance of the updated terms.`
          },
          {
            title: '12. Governing Law',
            body: `These Terms are governed by the laws of New South Wales, Australia. Any disputes shall be subject to the exclusive jurisdiction of the courts of New South Wales.`
          },
          {
            title: '13. Contact',
            body: `For any questions about these Terms of Service, please contact us at contact@shuttley.club.`
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
