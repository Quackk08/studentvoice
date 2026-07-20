import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router'
import ProtectedRoute from './components/shared/ProtectedRoute'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const GuidelinesPage = lazy(() => import('./pages/GuidelinesPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const ProposalsPage = lazy(() => import('./pages/ProposalsPage'))
const ArchivePage = lazy(() => import('./pages/ArchivePage'))
const WritePage = lazy(() => import('./pages/WritePage'))
const ProposalDetailPage = lazy(() => import('./pages/ProposalDetailPage'))
const MyPage = lazy(() => import('./pages/MyPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const ConfirmPage = lazy(() => import('./pages/ConfirmPage'))

function PageFallback() {
  return (
    <main className="page-fallback" aria-live="polite" aria-busy="true">
      화면을 불러오는 중…
    </main>
  )
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/confirm" element={<ConfirmPage />} />
          <Route path="/guidelines" element={<ProtectedRoute requireGuidelines={false}><GuidelinesPage /></ProtectedRoute>} />

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
      </Suspense>
    </Router>
  )
}
