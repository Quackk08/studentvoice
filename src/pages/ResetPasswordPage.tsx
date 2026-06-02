import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { validatePassword } from '../lib/security'
import MicMark from '../components/shared/MicMark'
import Btn from '../components/shared/Btn'
import { COLORS } from '../tokens/tokens'

// ── 공통 레이아웃 래퍼 — 컴포넌트 외부에 선언해야 렌더마다 재생성되지 않음
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: COLORS.bg, padding: 24,
        fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
        color: COLORS.ink, letterSpacing: '-0.01em',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <MicMark size={24} color={COLORS.ink} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>학생의 목소리</div>
            <div style={{ fontSize: 11, color: COLORS.inkSub, marginTop: 1 }}>대전대신고등학교</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        {show ? (
          <>
            <path d="M2 10s2.5-5 8-5 8 5 8 5-2.5 5-8 5-8-5-8-5Z" stroke={COLORS.inkSub} strokeWidth="1.4" />
            <circle cx="10" cy="10" r="2.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
            <line x1="3" y1="3" x2="17" y2="17" stroke={COLORS.inkSub} strokeWidth="1.4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M2 10s2.5-5 8-5 8 5 8 5-2.5 5-8 5-8-5-8-5Z" stroke={COLORS.inkSub} strokeWidth="1.4" />
            <circle cx="10" cy="10" r="2.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
          </>
        )}
      </svg>
    </button>
  )
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()

  const [password, setPassword]       = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading]     = useState(false)
  const [errorMsg, setErrorMsg]       = useState<string | null>(null)
  const [done, setDone]               = useState(false)

  // 세션 유효성 — Supabase가 URL 해시의 recovery 토큰을 자동 처리함
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    // URL 해시에 recovery 토큰이 있는지 확인
    const hasRecoveryHash = window.location.hash.includes('access_token')
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // 타임아웃 취소 — onAuthStateChange가 먼저 응답함
      if (fallbackTimer) clearTimeout(fallbackTimer)
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionReady(true)
      }
      setSessionChecked(true)
    })

    if (!hasRecoveryHash) {
      // 해시 없음 → 기존 세션 즉시 확인 (새로고침 등)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setSessionReady(true)
        setSessionChecked(true)
      })
    } else {
      // 해시 있음 → Supabase가 비동기로 토큰 교환 중이므로 getSession() 호출 금지.
      // onAuthStateChange를 기다리고, 5초 내 응답 없으면 만료로 처리.
      fallbackTimer = setTimeout(() => setSessionChecked(true), 5000)
    }

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [])

  const handleReset = async () => {
    const pwError = validatePassword(password)
    if (pwError) { setErrorMsg(pwError); return }
    if (password !== confirmPw) { setErrorMsg('비밀번호가 일치하지 않습니다.'); return }

    setIsLoading(true); setErrorMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setIsLoading(false)

    if (error) {
      setErrorMsg('비밀번호 변경에 실패했습니다. 링크가 만료됐을 수 있습니다.')
      return
    }

    await supabase.auth.signOut()
    setDone(true)
    setTimeout(() => navigate('/login'), 3000)
  }

  // ── 로딩 중
  if (!sessionChecked) {
    return (
      <Wrapper>
        <div style={{ textAlign: 'center', color: COLORS.inkMuted, fontSize: 14 }}>확인 중…</div>
      </Wrapper>
    )
  }

  // ── 링크 무효 / 만료
  if (!sessionReady) {
    return (
      <Wrapper>
        <div
          style={{
            padding: '20px 20px', borderRadius: 12,
            border: `1px solid ${COLORS.warn}33`,
            background: COLORS.warnSoft, marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.warn, marginBottom: 6 }}>
            링크가 유효하지 않습니다
          </div>
          <div style={{ fontSize: 13, color: COLORS.warn, lineHeight: 1.6, opacity: 0.85 }}>
            재설정 링크가 만료됐거나 이미 사용됐습니다.<br />
            비밀번호 찾기를 다시 시도해주세요.
          </div>
        </div>
        <Btn variant="brand" size="lg" full onClick={() => navigate('/login')}>
          로그인 화면으로
        </Btn>
      </Wrapper>
    )
  }

  // ── 변경 완료
  if (done) {
    return (
      <Wrapper>
        <div
          style={{
            padding: '20px 20px', borderRadius: 12,
            border: `1px solid ${COLORS.brand}33`,
            background: COLORS.brandSoft, marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.brand, marginBottom: 6 }}>
            비밀번호가 변경됐습니다 ✓
          </div>
          <div style={{ fontSize: 13, color: COLORS.brand, lineHeight: 1.6, opacity: 0.85 }}>
            새 비밀번호로 로그인해주세요.<br />
            잠시 후 자동으로 이동합니다.
          </div>
        </div>
        <Btn variant="outline" size="md" full onClick={() => navigate('/login')}>
          로그인 화면으로
        </Btn>
      </Wrapper>
    )
  }

  // ── 비밀번호 입력 폼
  return (
    <Wrapper>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: COLORS.inkMuted, marginBottom: 12 }}>
        RESET PASSWORD
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.025em' }}>
        새 비밀번호 설정
      </h1>
      <p style={{ fontSize: 13, color: COLORS.inkSub, margin: '0 0 28px', lineHeight: 1.6 }}>
        사용할 새 비밀번호를 입력하세요.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 새 비밀번호 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 8 }}>새 비밀번호</div>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${COLORS.line}`, borderRadius: 10,
              background: COLORS.surface, padding: '0 14px', height: 48,
            }}
          >
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="8자 이상"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontSize: 14, color: COLORS.ink,
                fontFamily: 'inherit', background: 'transparent', height: '100%',
              }}
            />
            <EyeToggle show={showPass} onToggle={() => setShowPass(v => !v)} />
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 6 }}>
            영문, 숫자, 기호를 조합하면 더 안전합니다.
          </div>
        </div>

        {/* 비밀번호 확인 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 8 }}>비밀번호 확인</div>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${confirmPw.length > 0 && confirmPw !== password ? COLORS.warn : COLORS.line}`,
              borderRadius: 10, background: COLORS.surface, padding: '0 14px', height: 48,
            }}
          >
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="비밀번호 다시 입력"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontSize: 14, color: COLORS.ink,
                fontFamily: 'inherit', background: 'transparent', height: '100%',
              }}
            />
            <EyeToggle show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
          </div>
          {confirmPw.length > 0 && confirmPw !== password && (
            <div style={{ fontSize: 11, color: COLORS.warn, marginTop: 6 }}>비밀번호가 일치하지 않습니다.</div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: COLORS.warnSoft, border: `1px solid ${COLORS.warn}33`,
            fontSize: 12, color: COLORS.warn,
          }}
        >
          {errorMsg}
        </div>
      )}

      <Btn
        variant="brand" size="lg" full
        style={{ marginTop: 20, opacity: isLoading ? 0.7 : 1 }}
        onClick={handleReset} disabled={isLoading}
      >
        {isLoading ? '변경 중…' : '비밀번호 변경하기'}
      </Btn>
    </Wrapper>
  )
}
