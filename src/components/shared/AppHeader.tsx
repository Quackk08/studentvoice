import { Link, useNavigate } from 'react-router'
import MicMark from './MicMark'
import Badge from './Badge'
import NotificationBell from './NotificationBell'
import { useAuth } from '../../contexts/AuthContext'
import { useNoticeStats } from '../../hooks/useProposals'
import { COLORS } from '../../tokens/tokens'

type ActiveTab = 'home' | 'proposals' | 'archive' | 'write'

interface AppHeaderProps {
  active?: ActiveTab
  isAdmin?: boolean
}

const NAV_TABS: { id: ActiveTab; label: string; to: string }[] = [
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

  const displayLabel = profile
    ? (profile.grade && profile.class ? `${profile.grade}학년 ${profile.class}반` : profile.name ?? profile.email?.split('@')[0] ?? '내 계정')
    : '내 계정'

  const avatarText = profile?.name
    ? profile.name.slice(0, 2)
    : (profile?.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <div>
      {/* Notice ribbon — desktop only */}
      <div
        className="hidden sm:flex items-center gap-2.5 px-12 py-2 text-white text-xs"
        style={{ background: COLORS.ink, letterSpacing: '0.01em' }}
      >
        <span
          className="text-2xs font-bold px-1.5 py-0.5 rounded-0.25"
          style={{ background: 'rgba(255,255,255,0.14)', letterSpacing: '0.08em' }}
        >
          NOTICE
        </span>
        <span style={{ opacity: 0.85 }}>{noticeText}</span>
        <span className="ml-auto text-xs" style={{ opacity: 0.55 }}>{noticeDate}</span>
      </div>

      {/* Main header */}
      <header
        className="bg-surface border-b border-line px-4 sm:px-12 py-3 sm:py-[18px] flex items-center gap-6 sm:gap-10"
      >
        {/* Logo */}
        <Link to="/home" className="no-underline flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <MicMark size={26} color={COLORS.ink} />
            <div className="flex flex-col leading-none">
              <span className="font-bold text-lg text-ink" style={{ letterSpacing: '-0.01em' }}>
                학생의 목소리
              </span>
              <span className="text-xs text-ink-sub mt-0.5" style={{ letterSpacing: '0.02em' }}>
                대전대신고등학교
              </span>
            </div>
          </div>
        </Link>

        {/* Nav — desktop only */}
        <nav className="hidden sm:flex gap-7 ml-6">
          {NAV_TABS.map(t => (
            <Link
              key={t.id}
              to={t.to}
              className="no-underline text-base pb-1"
              style={{
                fontWeight: active === t.id ? 600 : 500,
                color: active === t.id ? COLORS.ink : COLORS.inkSub,
                borderBottom: active === t.id ? `2px solid ${COLORS.brand}` : '2px solid transparent',
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3 sm:gap-3.5">
          <NotificationBell userId={profile?.id} />

          {/* Profile pill */}
          <div
            onClick={() => navigate('/mypage')}
            className="flex items-center gap-2.5 py-1.5 pl-3.5 pr-1.5 border border-line rounded-full cursor-pointer"
          >
            {isAdmin && <Badge tone="brand">운영자</Badge>}
            <span className="hidden sm:inline text-sm text-ink font-medium">{displayLabel}</span>
            <div
              className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: COLORS.brand }}
            >
              {avatarText}
            </div>
          </div>

          {/* Admin link — desktop only */}
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden sm:inline text-xs font-semibold no-underline border rounded-2 px-3 py-1.5"
              style={{ color: COLORS.brand, borderColor: COLORS.brand }}
            >
              관리자
            </Link>
          )}
        </div>
      </header>
    </div>
  )
}
