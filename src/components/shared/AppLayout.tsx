import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

type ActiveTab = 'home' | 'proposals' | 'archive' | 'write'

interface AppLayoutProps {
  children: React.ReactNode
  active?: ActiveTab
  isAdmin?: boolean
  showFooter?: boolean
}

export default function AppLayout({
  children,
  active = 'home',
  isAdmin = false,
  showFooter = true,
}: AppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-bg font-sans text-ink tracking-snug">
      <AppHeader active={active} isAdmin={isAdmin} />
      <main className="flex-1 flex flex-col pb-16 sm:pb-0">{children}</main>
      {showFooter && <AppFooter />}
      <BottomNav />
    </div>
  )
}

function AppFooter() {
  return (
    <footer className="hidden sm:block bg-footer-bg text-white px-15 pt-10 pb-8 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-start gap-8 sm:gap-20">
        {/* Logo */}
        <div className="flex items-center gap-2.5 sm:min-w-[170px] flex-shrink-0">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect x="10.5" y="4" width="7" height="13" rx="3.5" stroke="#fff" strokeWidth="1.6" />
            <path
              d="M6.5 13.5C6.5 17.6421 9.85786 21 14 21C18.1421 21 21.5 17.6421 21.5 13.5"
              stroke="#fff" strokeWidth="1.6" strokeLinecap="round"
            />
            <path d="M14 21V25M10.5 25H17.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <div className="leading-snug">
            <div className="text-xl font-bold">학생의 목소리</div>
            <div className="text-xl font-normal">대전대신고등학교</div>
          </div>
        </div>

        {/* CONTACT */}
        <div className="flex-shrink-0">
          <div className="text-sm font-bold tracking-wide mb-2.5">CONTACT</div>
          <div className="text-sm font-normal leading-7">
            Go Jin-yong<br />
            25_kjy1012@dshs.kr
          </div>
        </div>

        {/* LOCATION */}
        <div className="flex-shrink-0">
          <div className="text-sm font-bold tracking-wide mb-2.5">LOCATION</div>
          <div className="text-sm font-normal leading-7">
            대전광역시 서구 오량1길 98<br />
            Daejeon Korea&nbsp;&nbsp;Seo-gu, Oryang 1-gil, 98
          </div>
        </div>

        {/* PRIVACY */}
        <div className="flex-shrink-0 max-w-[290px]">
          <div className="text-sm font-bold tracking-wide mb-2.5">PRIVACY POLICY</div>
          <div className="text-sm font-normal leading-7" style={{ color: 'rgba(255,255,255,0.78)' }}>
            학생의 목소리는 학교 이메일 인증, 안건 작성, 투표 및 알림 제공에 필요한 최소한의 정보만 수집하며,
            수집된 정보는 서비스 운영과 학교 의견 전달 목적 외에는 사용하지 않습니다.
          </div>
        </div>

        {/* Copyright */}
        <div className="sm:ml-auto flex-shrink-0 flex flex-col sm:items-end sm:justify-end sm:self-stretch text-sm gap-1 whitespace-nowrap">
          <span>site made by{' '}
            <a
              href="https://github.com/Quackk08"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-white hover:underline"
            >
              Quackk08
            </a>
          </span>
          <span>© 2026 <strong className="font-bold">ACT.</strong> All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}
