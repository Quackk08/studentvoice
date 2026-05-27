import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router'
import { SpeedInsights } from '@vercel/speed-insights/react'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import GuidelinesPage from './pages/GuidelinesPage'
import HomePage from './pages/HomePage'
import ProposalsPage from './pages/ProposalsPage'
import ArchivePage from './pages/ArchivePage'
import WritePage from './pages/WritePage'
import ProposalDetailPage from './pages/ProposalDetailPage'
import MyPage from './pages/MyPage'
import AdminPage from './pages/AdminPage'
import ProtectedRoute from './components/shared/ProtectedRoute'

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guidelines" element={<GuidelinesPage />} />

        {/* Protected — requires auth + agreed to guidelines */}
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/proposals" element={<ProtectedRoute><ProposalsPage /></ProtectedRoute>} />
        <Route path="/archive" element={<ProtectedRoute><ArchivePage /></ProtectedRoute>} />
        <Route path="/write" element={<ProtectedRoute><WritePage /></ProtectedRoute>} />
        <Route path="/proposals/:id" element={<ProtectedRoute><ProposalDetailPage /></ProtectedRoute>} />
        <Route path="/mypage" element={<ProtectedRoute><MyPage /></ProtectedRoute>} />

        {/* Admin-only */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SpeedInsights />
    </Router>
  )
}
