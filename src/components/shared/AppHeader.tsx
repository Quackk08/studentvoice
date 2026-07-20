import { Link, useNavigate } from 'react-router'
import MicMark from './MicMark'
import Badge from './Badge'
import NotificationBell from './NotificationBell'
import { useAuth } from '../../contexts/AuthContext'
import { useNoticeStats } from '../../hooks/useProposals'
import { COLORS } from '../../tokens/tokens'

type ActiveTab = 'home' | 'proposals' | 'archive' | 'write' | 'admin'

interface AppHeaderProps {
  active?: ActiveTab
  isAdmin?: boolean
}

const NAV_TABS: { id: Exclude<ActiveTab, 'admin'>; label: string; to: string }[] = [
  { id: 'home',      label: '홈',           to: '/home' },
  { id: 'proposals', label: '전체 안건',     to: '/proposals' },
  { id: 'archive',   label: '답변 · 아카이브', to: '/archive' },
  { id: 'write',     label: '의견 제안',    to: '/write' },
]

export default function AppHeader({ active = 'home', isAdmin = false }: AppHeaderProps) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { stats: noticeStats, loading: noticeLoading } = useNoticeStats()
  const noticeMonth = new Date().getMonth() + 1
  const noticeDate = new Date(noticeStats.latestDeliveredAt ?? Date.now()).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const noticeText = noticeLoading
    ? '학생회 전달 현황을 불러오는 중입니다.'
    : `${noticeMonth}월 학생회 정기회의에서 선정된 안건 ${noticeStats.deliveredThisMonth.toLocaleString('ko-KR')}건이 학교 측에 전달되었습니다.`

  // 프로필 표시용 값
  const displayLabel = profile
    ? (profile.grade && profile.class ? `${profile.grade}학년 ${profile.class}반` : profile.name ?? profile.email?.split('@')[0] ?? '내 계정')
    : '내 계정'

  const avatarText = profile?.name
    ? profile.name.slice(0, 2)
    : (profile?.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <div>
      {/* Notice ribbon */}
      <div
        className="notice-ribbon"
        style={{
          background: COLORS.ink,
          color: '#fff',
          fontSize: 12,
          padding: '8px 48px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          letterSpacing: '0.01em',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 3,
            background: 'rgba(255,255,255,0.14)',
            letterSpacing: '0.08em',
          }}
        >
          NOTICE
        </span>
        <span style={{ opacity: 0.85 }}>
          {noticeText}
        </span>
        <span style={{ marginLeft: 'auto', opacity: 0.55, fontSize: 11 }}>{noticeDate}</span>
      </div>

      {/* Main header */}
      <header
        className="app-header"
        style={{
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.line}`,
          padding: '18px 48px',
          display: 'flex',
          alignItems: 'center',
          gap: 40,
        }}
      >
        {/* Logo */}
        <Link to="/home" style={{ textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MicMark size={26} color={COLORS.ink} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.ink, letterSpacing: '-0.01em' }}>
                학생의 목소리
              </span>
              <span style={{ fontSize: 11, color: COLORS.inkSub, marginTop: 2, letterSpacing: '0.02em' }}>
                대전대신고등학교
              </span>
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="app-nav" aria-label="주요 메뉴" style={{ display: 'flex', gap: 28, marginLeft: 24 }}>
          {NAV_TABS.map(t => (
            <Link
              key={t.id}
              to={t.to}
              style={{
                fontSize: 14,
                fontWeight: active === t.id ? 600 : 500,
                color: active === t.id ? COLORS.ink : COLORS.inkSub,
                position: 'relative',
                paddingBottom: 4,
                borderBottom: active === t.id ? `2px solid ${COLORS.brand}` : '2px solid transparent',
                textDecoration: 'none',
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="app-header-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <NotificationBell userId={profile?.id} />

          {/* Profile pill — real data */}
          <button
            type="button"
            aria-label="마이페이지 열기"
            onClick={() => navigate('/mypage')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 6px 6px 14px',
              border: `1px solid ${COLORS.line}`,
              borderRadius: 99,
              cursor: 'pointer',
              background: COLORS.surface,
            }}
          >
            {isAdmin && <Badge tone="brand">운영자</Badge>}
            <span style={{ fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
              {displayLabel}
            </span>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 99,
                background: COLORS.brand,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {avatarText}
            </div>
          </button>

          {/* Admin link */}
          {isAdmin && (
            <Link
              to="/admin"
              style={{
                fontSize: 12,
                color: active === 'admin' ? '#fff' : COLORS.brand,
                fontWeight: 600,
                textDecoration: 'none',
                border: `1px solid ${COLORS.brand}`,
                borderRadius: 8,
                padding: '6px 12px',
                background: active === 'admin' ? COLORS.brand : COLORS.surface,
              }}
            >
              관리자
            </Link>
          )}
        </div>
      </header>
    </div>
  )
}
