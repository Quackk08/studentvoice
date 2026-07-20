import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import MicMark from '../components/shared/MicMark'
import Btn from '../components/shared/Btn'
import { COLORS } from '../tokens/tokens'

type State = 'idle' | 'loading' | 'success' | 'error'

export default function ConfirmPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const tokenVerificationStarted = useRef(false)

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') ?? 'signup'

  // SECURITY FIX P2 (2025-05-28): token_hash 형식 검증 — 64자 이하 hex 문자열만 허용.
  // 임의 문자열이 verifyOtp에 전달되는 것을 차단.
  const TOKEN_HASH_RE = /^[0-9a-f]{1,128}$/i
  const isValidToken = tokenHash !== null && TOKEN_HASH_RE.test(tokenHash)

  const handleConfirm = async () => {
    if (!isValidToken || !tokenHash) return
    setState('loading')
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'signup' | 'email',
      })
      if (error) {
        setErrorMsg(
          error.message.toLowerCase().includes('expired')
            ? '인증 링크가 만료되었습니다. 다시 회원가입을 진행해주세요.'
            : '인증에 실패했습니다. 링크가 유효하지 않습니다.',
        )
        setState('error')
        return
      }
      // 인증 완료 후 자동 생성된 세션은 해제 — 이후 로그인은 직접
      await supabase.auth.signOut()
      setState('success')
      setTimeout(() => navigate('/login?confirmed=true'), 2500)
    } catch {
      setErrorMsg('인증 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      setState('error')
    }
  }

  useEffect(() => {
    if (tokenHash) {
      if (tokenVerificationStarted.current) return
      tokenVerificationStarted.current = true
      if (isValidToken) handleConfirm()
      else {
        setErrorMsg('인증 링크 형식이 올바르지 않습니다.')
        setState('error')
      }
      return
    }

    let finished = false
    let redirectTimer: ReturnType<typeof setTimeout> | undefined
    setState('loading')

    const finishFromSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      if (finished || !session?.user?.email_confirmed_at) return
      finished = true
      await supabase.auth.signOut()
      setState('success')
      redirectTimer = setTimeout(() => navigate('/login?confirmed=true'), 2500)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      finishFromSession(session)
    })
    supabase.auth.getSession().then(({ data }) => finishFromSession(data.session))

    const fallbackTimer = setTimeout(() => {
      if (!finished) {
        finished = true
        setErrorMsg('인증 링크가 만료됐거나 이미 사용되었습니다.')
        setState('error')
      }
    }, 5000)

    return () => {
      finished = true
      clearTimeout(fallbackTimer)
      if (redirectTimer) clearTimeout(redirectTimer)
      subscription.unsubscribe()
    }
  }, [isValidToken, tokenHash, type])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: COLORS.bg,
        fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
        color: COLORS.ink,
        padding: 24,
      }}
    >
      <div
        style={{
          background: COLORS.surface,
          borderRadius: 20,
          padding: '48px 44px',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 4px 40px rgba(0,0,0,0.08)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
          <MicMark size={24} color={COLORS.ink} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, letterSpacing: '-0.01em' }}>학생의 목소리</div>
            <div style={{ fontSize: 11, color: COLORS.inkSub, marginTop: 2 }}>대전대신고등학교</div>
          </div>
        </div>

        {state === 'success' ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 20 }}>✅</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.025em', marginBottom: 12 }}>
              인증 완료!
            </h2>
            <p style={{ fontSize: 14, color: COLORS.inkSub, lineHeight: 1.7, margin: 0 }}>
              이메일 인증이 완료되었습니다.<br />잠시 후 로그인 화면으로 이동합니다.
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
                color: COLORS.brand, marginBottom: 12,
              }}
            >
              EMAIL VERIFICATION
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.2 }}>
              이메일 인증
            </h2>
            <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 10, lineHeight: 1.65 }}>
              아래 버튼을 눌러 인증을 완료하면<br />학생의 목소리를 이용할 수 있습니다.
            </p>

            {state === 'error' && errorMsg && (
              <div
                style={{
                  marginTop: 20, padding: '10px 14px', borderRadius: 8,
                  background: COLORS.warnSoft, border: `1px solid ${COLORS.warn}33`,
                  fontSize: 12, color: COLORS.warn, lineHeight: 1.55,
                }}
              >
                {errorMsg}
              </div>
            )}

            <Btn
              variant="brand" size="lg" full
              style={{ marginTop: 28, opacity: state === 'loading' ? 0.7 : 1 }}
              onClick={handleConfirm}
              disabled={state === 'loading' || !tokenHash}
            >
              {state === 'loading' ? '인증 중…' : '이메일 인증 완료하기'}
            </Btn>

            {state === 'error' && (
              <Btn
                variant="outline" size="md" full
                style={{ marginTop: 10 }}
                onClick={() => navigate('/login')}
              >
                로그인 화면으로
              </Btn>
            )}

            <div
              style={{
                marginTop: 28, paddingTop: 20,
                borderTop: `1px solid ${COLORS.lineSoft}`,
                fontSize: 11, color: COLORS.inkMuted, lineHeight: 1.6, textAlign: 'center',
              }}
            >
              링크가 만료된 경우 처음부터 다시 가입해주세요.<br />
              문의: 학생회 운영팀 · 25_kjy1012@dshs.kr
            </div>
          </>
        )}
      </div>
    </div>
  )
}
