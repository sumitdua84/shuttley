import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useRegisterSW } from 'virtual:pwa-register/react'
import CoachWidget from './components/CoachWidget'
import { useIOSPushTokenBridge } from './hooks/usePushNotifications'
import './index.css'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const HomePage = lazy(() => import('./pages/HomePage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const SessionPage = lazy(() => import('./pages/SessionPage'))
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'))
const ModeratorDashboard = lazy(() => import('./pages/ModeratorDashboard'))
const ClubPage = lazy(() => import('./pages/ClubPage'))
const JoinClub = lazy(() => import('./pages/JoinClub'))
const RecordMatch = lazy(() => import('./pages/RecordMatch'))
const MatchesPage = lazy(() => import('./pages/MatchesPage'))
const SessionSummary = lazy(() => import('./pages/SessionSummary'))
const RotationPage = lazy(() => import('./pages/RotationPage'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const SplitsPage = lazy(() => import('./pages/SplitsPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

function RouteFallback() {
  return (
    <div className="splash">
      <div className="splash-logo">S</div>
    </div>
  )
}

// Wraps the matched route in a short fade so navigation feels less like a
// hard page swap. Keying on pathname remounts the wrapper (not the route's
// own state) on every navigation, which is what drives the fade-in.
function RouteTransition({ children }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="route-fade">
      {children}
    </div>
  )
}

function AppRoutes() {
  const { user, loading, pendingDeletion, signOut } = useAuth()
  useIOSPushTokenBridge(user?.id)

  if (loading) return (
    <div className="splash">
      <div className="splash-logo">S</div>
    </div>
  )

  if (user && pendingDeletion) return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 28px', background:'#fff', maxWidth:430, margin:'0 auto', textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:20 }}>⏳</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'#256575', marginBottom:12 }}>Account Deletion in Progress</h2>
      <p style={{ fontSize:14, color:'#6ea6b4', lineHeight:1.7, marginBottom:32 }}>
        Your account deletion request has been submitted and is pending admin approval. You will be notified once it is processed.
      </p>
      <p style={{ fontSize:13, color:'#6ea6b4', marginBottom:24 }}>
        Questions? <a href="mailto:support@shuttley.club" style={{ color:'#256575' }}>support@shuttley.club</a>
      </p>
      <button onClick={signOut} style={{ background:'none', border:'0.5px solid rgba(37,101,117,0.3)', borderRadius:8, padding:'10px 24px', color:'#6ea6b4', fontSize:13, cursor:'pointer' }}>
        Sign Out
      </button>
    </div>
  )

  return (
    <>
      {user && !pendingDeletion && <CoachWidget />}
      <Suspense fallback={<RouteFallback />}>
        <RouteTransition>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
            <Route path="/join/:inviteCode" element={<JoinClub />} />
            <Route path="/" element={user ? <HomePage /> : <Navigate to="/login" />} />
            <Route path="/groups" element={user ? <OnboardingPage /> : <Navigate to="/login" />} />
            <Route path="/session" element={user ? <SessionPage /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId" element={user ? <ClubPage /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/member" element={user ? <MemberDashboard /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/mod" element={user ? <ModeratorDashboard /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/matches" element={user ? <MatchesPage /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/record" element={user ? <RecordMatch /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/session/:sessionId" element={user ? <SessionSummary /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/session/:sessionId/rotation" element={user ? <RotationPage /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/splits" element={user ? <SplitsPage /> : <Navigate to="/login" />} />
            <Route path="/club/:clubId/chat" element={user ? <ChatPage /> : <Navigate to="/login" />} />
            <Route path="/admin" element={user ? <AdminDashboard /> : <Navigate to="/login" />} />
            {/* Public — no login required */}
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/delete-account" element={<DeleteAccount />} />
            <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/login" />} />
          </Routes>
        </RouteTransition>
      </Suspense>
    </>
  )
}

function AutoUpdate() {
  const { needRefresh, updateServiceWorker } = useRegisterSW()
  useEffect(() => {
    if (needRefresh[0]) updateServiceWorker(true)
  }, [needRefresh[0]])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AutoUpdate />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
