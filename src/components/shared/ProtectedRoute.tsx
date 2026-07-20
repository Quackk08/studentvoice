import { Navigate } from 'react-router'
import { isEmailVerified, useAuth } from '../../contexts/AuthContext'
import { COLORS } from '../../tokens/tokens'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
  requireGuidelines?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false, requireGuidelines = true }: ProtectedRouteProps) {
  const { user, profile, loading, signOut, refreshProfile } = useAuth()

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

  if (!profile) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: COLORS.bg }}>
        <div style={{ maxWidth: 420, padding: 28, borderRadius: 16, border: `1px solid ${COLORS.line}`, background: '#fff', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.ink }}>계정 정보를 불러오지 못했습니다</h1>
          <p style={{ margin: '12px 0 20px', fontSize: 13, lineHeight: 1.6, color: COLORS.inkSub }}>
            가입 정보 생성이 지연됐을 수 있습니다. 다시 시도하거나 로그아웃 후 로그인해주세요.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button type="button" onClick={refreshProfile} style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${COLORS.line}`, background: '#fff', cursor: 'pointer' }}>다시 시도</button>
            <button type="button" onClick={signOut} style={{ padding: '9px 14px', borderRadius: 8, border: 0, background: COLORS.ink, color: '#fff', cursor: 'pointer' }}>로그아웃</button>
          </div>
        </div>
      </main>
    )
  }

  // Signed in but hasn't agreed to guidelines yet
  if (requireGuidelines && !profile.agreed_to_guidelines) {
    return <Navigate to="/guidelines" replace />
  }

  // Admin-only route check
  if (adminOnly && !profile?.is_admin) {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}
