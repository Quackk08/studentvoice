import { Navigate } from 'react-router'
import { isEmailVerified, useAuth } from '../../contexts/AuthContext'
import { COLORS } from '../../tokens/tokens'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()

  // Wait for auth to initialize
  if (loading) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          height: '100vh',
          background: COLORS.bg,
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 99,
              border: `2.5px solid ${COLORS.line}`,
              borderTopColor: COLORS.brand,
              animation: 'spin 0.7s linear infinite',
            }}
          />
          <span style={{ fontSize: 13, color: COLORS.inkMuted }}>로딩 중…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Not signed in
  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isEmailVerified(user)) {
    return <Navigate to="/login" replace />
  }

  // Signed in but hasn't agreed to guidelines yet
  if (profile && !profile.agreed_to_guidelines) {
    return <Navigate to="/guidelines" replace />
  }

  // Admin-only route check
  if (adminOnly && !profile?.is_admin) {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}
