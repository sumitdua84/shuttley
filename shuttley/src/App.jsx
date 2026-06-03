import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useRegisterSW } from 'virtual:pwa-register/react'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import OnboardingPage from './pages/OnboardingPage'
import MemberDashboard from './pages/MemberDashboard'
import ModeratorDashboard from './pages/ModeratorDashboard'
import ClubPage from './pages/ClubPage'
import JoinClub from './pages/JoinClub'
import RecordMatch from './pages/RecordMatch'
import MatchesPage from './pages/MatchesPage'
import SessionSummary from './pages/SessionSummary'
import RotationPage from './pages/RotationPage'
import AdminDashboard from './pages/AdminDashboard'
import SplitsPage from './pages/SplitsPage'
import ChatPage from './pages/ChatPage'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import DeleteAccount from './pages/DeleteAccount'
import ProfilePage from './pages/ProfilePage'
import { useIOSPushTokenBridge } from './hooks/usePushNotifications'
import './index.css'

function AppRoutes() {
  const { user, loading } = useAuth()
  useIOSPushTokenBridge(user?.id)

  if (loading) return (
    <div className="splash">
      <div className="splash-logo">S</div>
    </div>
  )

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/join/:inviteCode" element={<JoinClub />} />
      <Route path="/" element={user ? <OnboardingPage /> : <Navigate to="/login" />} />
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
