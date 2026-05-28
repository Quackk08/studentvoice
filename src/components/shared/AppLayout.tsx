import AppHeader from './AppHeader'
import { COLORS } from '../../tokens/tokens'

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        fontFamily:
          "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
        color: COLORS.ink,
        letterSpacing: '-0.01em',
      }}
    >
      <AppHeader active={active} isAdmin={isAdmin} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</main>
      {showFooter && <AppFooter />}

      {/* Portrait orientation warning */}
      <div className="portrait-overlay">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="10" y="4" width="28" height="40" rx="5" stroke="#0E5240" strokeWidth="2.2" />
          <path d="M24 34.5V36" stroke="#0E5240" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M18 14l6-6 6 6M24 8v14" stroke="#0E5240" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#171717', letterSpacing: '-0.02em', marginBottom: 8 }}>
            화면을 가로로 돌려주세요
          </div>
          <div style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.65 }}>
            학생의 목소리는 가로 화면에 최적화되어 있습니다.<br />
            기기를 가로로 회전하면 더 나은 환경에서 이용하실 수 있습니다.
          </div>
        </div>
      </div>
    </div>
  )
}

function AppFooter() {
  return (
    <footer
      style={{
        background: '#004D3F',
        color: '#fff',
        padding: '40px 60px 32px',
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 80 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 170, flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect x="10.5" y="4" width="7" height="13" rx="3.5" stroke="#fff" strokeWidth="1.6" />
            <path
              d="M6.5 13.5C6.5 17.6421 9.85786 21 14 21C18.1421 21 21.5 17.6421 21.5 13.5"
              stroke="#fff" strokeWidth="1.6" strokeLinecap="round"
            />
            <path d="M14 21V25M10.5 25H17.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <div style={{ lineHeight: 1.35 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>학생의 목소리</div>
            <div style={{ fontSize: 16, fontWeight: 400 }}>대전대신고등학교</div>
          </div>
        </div>

        {/* CONTACT */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 10 }}>CONTACT</div>
          <div style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.75 }}>
            Go Jin-yong<br />
            25_kjy1012@dshs.kr
          </div>
        </div>

        {/* LOCATION */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 10 }}>LOCATION</div>
          <div style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.75 }}>
            대전광역시 서구 오량1길 98<br />
            Daejeon Korea&nbsp;&nbsp;Seo-gu, Oryang 1-gil, 98
          </div>
        </div>

        {/* PRIVACY */}
        <div style={{ flexShrink: 0, maxWidth: 290 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 10 }}>PRIVACY POLICY</div>
          <div style={{ fontSize: 12.5, fontWeight: 400, lineHeight: 1.75, color: 'rgba(255,255,255,0.78)' }}>
            학생의 목소리는 학교 이메일 인증, 안건 작성, 투표 및 알림 제공에 필요한 최소한의 정보만 수집하며,
            수집된 정보는 서비스 운영과 학교 의견 전달 목적 외에는 사용하지 않습니다.
          </div>
        </div>

        {/* Copyright */}
        <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-end', alignSelf: 'stretch', fontSize: 13, gap: 4, whiteSpace: 'nowrap' }}>
          <span>site made by <a href="https://github.com/Quackk08" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration='none')}>Quackk08</a></span>
          <span>© 2026 <strong style={{ fontWeight: 700 }}>ACT.</strong> All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}
