import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
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
import './index.css'

function AppRoutes() {
  const { user, loading } = useAuth()

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
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
