import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import MicMark from '../components/shared/MicMark'
import Btn from '../components/shared/Btn'
import { useAuth, isEmailVerified } from '../contexts/AuthContext'
import { isSchoolEmail, normalizeText, validatePassword } from '../lib/security'
import { supabase } from '../lib/supabase'
import { COLORS } from '../tokens/tokens'

// ── InputField ──────────────────────────────────────────────
interface InputFieldProps {
  label: string
  type?: string
  placeholder?: string
  value: string
  hint?: string
  suffix?: React.ReactNode
  error?: boolean
  onChange: (v: string) => void
  onEnter?: () => void
}

function InputField({ label, type = 'text', placeholder, value, hint, suffix, error, onChange, onEnter }: InputFieldProps) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 8, letterSpacing: '-0.01em' }}>
        {label}
      </div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: `1px solid ${error ? COLORS.warn : COLORS.line}`,
          borderRadius: 10, background: COLORS.surface,
          padding: '0 14px', height: 48,
          transition: 'border-color .15s',
        }}
      >
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter?.()}
          style={{
            flex: 1, border: 'none', outline: 'none',
            fontSize: 14, color: COLORS.ink,
            fontFamily: 'inherit', background: 'transparent', height: '100%',
          }}
        />
        {suffix}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: error ? COLORS.warn : COLORS.inkMuted, marginTop: 6 }}>{hint}</div>
      )}
    </div>
  )
}

// ── GradeClassPicker ─────────────────────────────────────────
function GradeClassPicker({
  grade, classNum, onGrade, onClass,
}: { grade: number | null; classNum: string; onGrade: (g: number) => void; onClass: (c: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12 }}>
      {/* Grade buttons */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 8 }}>학년</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3].map(g => (
            <button
              key={g}
              onClick={() => onGrade(g)}
              style={{
                width: 44, height: 44, borderRadius: 10, border: 'none',
                background: grade === g ? COLORS.ink : COLORS.surfaceAlt,
                color: grade === g ? '#fff' : COLORS.inkSub,
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', letterSpacing: '-0.01em',
                transition: 'all .15s',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      {/* Class number input */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 8 }}>반</div>
        <div
          style={{
            display: 'flex', alignItems: 'center',
            border: `1px solid ${COLORS.line}`, borderRadius: 10,
            background: COLORS.surface, padding: '0 14px', height: 44,
          }}
        >
          <input
            type="number"
            placeholder="반 번호"
            value={classNum}
            min={1} max={20}
            onChange={e => onClass(e.target.value)}
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 14, color: COLORS.ink, fontFamily: 'inherit', background: 'transparent',
            }}
          />
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>반</span>
        </div>
      </div>
    </div>
  )
}

// ── EyeIcon ──────────────────────────────────────────────────
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


// ── ErrorBanner ──────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: '10px 14px', borderRadius: 8,
        background: COLORS.warnSoft,
        border: `1px solid ${COLORS.warn}33`,
        fontSize: 12, color: COLORS.warn,
      }}
    >
      {msg}
    </div>
  )
}

// ── SuccessBanner ────────────────────────────────────────────
function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: '12px 14px', borderRadius: 8,
        background: COLORS.brandSoft,
        border: `1px solid ${COLORS.brand}33`,
        fontSize: 13, color: COLORS.brand, fontWeight: 600,
        lineHeight: 1.55,
      }}
    >
      {msg}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════
export default function LoginPage() {
  const navigate = useNavigate()
  const { signIn, signUp, profile, user, loading } = useAuth()

  // 이미 로그인된 상태(이메일 확인 후 리디렉션 포함)이면 자동 이동
  useEffect(() => {
    if (loading) return
    if (user && isEmailVerified(user)) {
      navigate(profile?.agreed_to_guidelines ? '/home' : '/guidelines', { replace: true })
    }
  }, [user, profile, loading])

  // Mode: 'login' | 'signup' | 'forgot'
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')

  // Shared fields
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  // Signup-only fields
  const [confirmPw, setConfirmPw]   = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [name, setName]             = useState('')
  const [grade, setGrade]           = useState<number | null>(null)
  const [classNum, setClassNum]     = useState('')

  // UI state
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [remember, setRemember]   = useState(false)

  const switchMode = (m: 'login' | 'signup' | 'forgot') => {
    setMode(m)
    setErrorMsg(null)
    setSuccessMsg(null)
  }

  // ── Forgot password ──
  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) { setErrorMsg('이메일을 입력해주세요.'); return }
    if (!isSchoolEmail(normalizedEmail)) { setErrorMsg('대전대신고 이메일(@dshs.kr)만 사용할 수 있습니다.'); return }
    setIsLoading(true); setErrorMsg(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) { setErrorMsg('링크 발송에 실패했습니다. 잠시 후 다시 시도해주세요.'); return }
      setSuccessMsg(`${normalizedEmail} 으로 재설정 링크를 보냈습니다. 학교 이메일함을 확인해주세요.`)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Login ──
  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) { setErrorMsg('이메일과 비밀번호를 입력해주세요.'); return }
    setIsLoading(true); setErrorMsg(null)
    try {
      const { error } = await signIn(normalizedEmail, password)
      if (error) {
        setErrorMsg(error.includes('본인 인증') ? error : '이메일 또는 비밀번호가 올바르지 않습니다.')
        return
      }
      navigate(profile?.agreed_to_guidelines ? '/home' : '/guidelines')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Signup ──
  const handleSignup = async () => {
    setErrorMsg(null)

    // Validation
    const normalizedEmail = email.trim().toLowerCase()
    const passwordError = validatePassword(password)
    if (!normalizedEmail) { setErrorMsg('이메일을 입력해주세요.'); return }
    if (!isSchoolEmail(normalizedEmail)) { setErrorMsg('대전대신고 이메일(@dshs.kr)만 가입할 수 있습니다.'); return }
    if (passwordError) { setErrorMsg(passwordError); return }
    if (password !== confirmPw) { setErrorMsg('비밀번호와 비밀번호 확인이 일치하지 않습니다.'); return }

    setIsLoading(true)
    try {
      const { error, needsConfirmation } = await signUp({
        email: normalizedEmail,
        password,
        name: normalizeText(name, 40) || undefined,
        grade: grade ?? undefined,
        classNum: classNum ? Number(classNum) : undefined,
      })

      if (error) {
        if (error.includes('already registered') || error.includes('already been registered')) {
          setErrorMsg('이미 가입된 이메일입니다. 로그인해주세요.')
        } else {
          setErrorMsg(error)
        }
        return
      }

      if (needsConfirmation) {
        setSuccessMsg('본인 인증 메일을 보냈습니다. 학교 이메일함에서 인증 링크를 클릭한 뒤 로그인해주세요.')
        return
      }
    } finally {
      setIsLoading(false)
    }

    setSuccessMsg('본인 인증 메일을 보냈습니다. 학교 이메일함에서 인증 링크를 클릭한 뒤 로그인해주세요.')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: COLORS.surface,
        fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
        color: COLORS.ink,
        letterSpacing: '-0.01em',
      }}
    >
      {/* ── Left visual ── */}
      <div
        style={{
          background: COLORS.bg,
          padding: '56px 56px 48px',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
        }}
      >
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

        {/* Large bg type */}
        <div
          style={{
            position: 'absolute', left: -20, bottom: 80,
            fontSize: 220, fontWeight: 800, lineHeight: 0.85,
            color: 'rgba(14, 82, 64, 0.06)', letterSpacing: '-0.06em',
            pointerEvents: 'none', userSelect: 'none',
          }}
        >
          Voice<br />of<br />Daeshin
        </div>

        <div style={{ marginTop: 'auto', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: COLORS.brand, marginBottom: 18 }}>
            DAESHIN HIGH SCHOOL · 2026
          </div>
          <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.0, margin: 0, letterSpacing: '-0.035em', color: COLORS.ink }}>
            학교를 바꾸는<br />가장 작은 한 표.
          </h1>
          <p style={{ fontSize: 14, color: COLORS.inkSub, marginTop: 22, lineHeight: 1.65, maxWidth: 380 }}>
            학생이 직접 제안하고, 30표가 모이면 학생회를 통해 학교에 전달됩니다.
            작은 의견이 학교의 내일이 되도록.
          </p>
        </div>
      </div>

      {/* ── Right form ── */}
      <div
        style={{
          display: 'grid', placeItems: 'center', padding: 48,
          overflowY: 'auto',
        }}
      >
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Mode toggle — hidden in forgot mode */}
          {mode !== 'forgot' && (
            <div
              style={{
                display: 'flex', gap: 0, marginBottom: 32,
                border: `1px solid ${COLORS.line}`, borderRadius: 12,
                padding: 4, background: COLORS.surfaceAlt,
              }}
            >
              {(['login', 'signup'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1, height: 38, borderRadius: 9, border: 'none',
                    background: mode === m ? COLORS.surface : 'transparent',
                    color: mode === m ? COLORS.ink : COLORS.inkSub,
                    fontSize: 13, fontWeight: mode === m ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em',
                    boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all .15s',
                  }}
                >
                  {m === 'login' ? '로그인' : '회원가입'}
                </button>
              ))}
            </div>
          )}

          {/* ─── LOGIN MODE ─── */}
          {mode === 'login' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: COLORS.inkMuted, marginBottom: 12 }}>
                SIGN IN
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
                학생 계정으로 로그인
              </h2>
              <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 8, lineHeight: 1.6 }}>
                학교 이메일로 접속하세요.
              </p>

              <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <InputField
                  label="이메일"
                  placeholder="학번@dshs.kr"
                  value={email}
                  onChange={setEmail}
                  onEnter={handleLogin}
                />
                <InputField
                  label="비밀번호"
                  type={showPass ? 'text' : 'password'}
                  placeholder="비밀번호 입력"
                  value={password}
                  onChange={setPassword}
                  onEnter={handleLogin}
                  suffix={<EyeToggle show={showPass} onToggle={() => setShowPass(!showPass)} />}
                />
              </div>

              {errorMsg && <div style={{ marginTop: 12 }}><ErrorBanner msg={errorMsg} /></div>}

              <Btn
                variant="brand" size="lg" full
                style={{ marginTop: 20, opacity: isLoading ? 0.7 : 1 }}
                onClick={handleLogin} disabled={isLoading}
              >
                {isLoading ? '로그인 중…' : '로그인'}
              </Btn>

              <div
                style={{
                  marginTop: 16, display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', fontSize: 12, color: COLORS.inkSub,
                }}
              >
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
                  onClick={() => setRemember(!remember)}
                >
                  <span
                    style={{
                      width: 14, height: 14, borderRadius: 3,
                      border: `1.4px solid ${remember ? COLORS.brand : COLORS.inkMuted}`,
                      background: remember ? COLORS.brand : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {remember && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                  </span>
                  로그인 상태 유지
                </label>
                <span
                  onClick={() => switchMode('signup')}
                  style={{ color: COLORS.brand, fontWeight: 600, cursor: 'pointer' }}
                >
                  계정이 없으신가요? →
                </span>
              </div>

              <div style={{ marginTop: 10, textAlign: 'right' }}>
                <span
                  onClick={() => switchMode('forgot')}
                  style={{ fontSize: 12, color: COLORS.inkMuted, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  비밀번호를 잊으셨나요?
                </span>
              </div>
            </>
          )}

          {/* ─── SIGNUP MODE ─── */}
          {mode === 'signup' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: COLORS.inkMuted, marginBottom: 12 }}>
                SIGN UP
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
                재학생 계정 만들기
              </h2>
              <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 8, lineHeight: 1.6 }}>
                대전대신고 이메일(@dshs.kr)로 가입하세요.
              </p>

              {successMsg ? (
                <div style={{ marginTop: 28 }}>
                  <SuccessBanner msg={successMsg} />
                  <Btn
                    variant="outline" size="md" full
                    style={{ marginTop: 16 }}
                    onClick={() => switchMode('login')}
                  >
                    로그인 화면으로
                  </Btn>
                </div>
              ) : (
                <>
                  <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Email */}
                    <InputField
                      label="학교 이메일"
                      placeholder="학번@dshs.kr"
                      value={email}
                      onChange={setEmail}
                    />

                    {/* Password */}
                    <InputField
                      label="비밀번호"
                      type={showPass ? 'text' : 'password'}
                      placeholder="8자 이상"
                      value={password}
                      onChange={setPassword}
                      suffix={<EyeToggle show={showPass} onToggle={() => setShowPass(!showPass)} />}
                      hint="영문, 숫자, 기호를 조합하면 더 안전합니다."
                    />

                    {/* Confirm password */}
                    <InputField
                      label="비밀번호 확인"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="비밀번호 다시 입력"
                      value={confirmPw}
                      onChange={setConfirmPw}
                      error={confirmPw.length > 0 && confirmPw !== password}
                      hint={confirmPw.length > 0 && confirmPw !== password ? '비밀번호가 일치하지 않습니다.' : undefined}
                      suffix={<EyeToggle show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />}
                    />

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: COLORS.lineSoft }} />
                      <span style={{ fontSize: 11, color: COLORS.inkMuted }}>선택 정보</span>
                      <div style={{ flex: 1, height: 1, background: COLORS.lineSoft }} />
                    </div>

                    {/* Name */}
                    <InputField
                      label="이름"
                      placeholder="홍길동 (마이페이지에 표시)"
                      value={name}
                      onChange={setName}
                    />

                    {/* Grade + Class */}
                    <GradeClassPicker
                      grade={grade}
                      classNum={classNum}
                      onGrade={setGrade}
                      onClass={setClassNum}
                    />
                  </div>

                  {errorMsg && <div style={{ marginTop: 12 }}><ErrorBanner msg={errorMsg} /></div>}

                  <Btn
                    variant="brand" size="lg" full
                    style={{ marginTop: 20, opacity: isLoading ? 0.7 : 1 }}
                    onClick={handleSignup} disabled={isLoading}
                  >
                    {isLoading ? '가입 중…' : '가입하기'}
                  </Btn>

                  <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: COLORS.inkSub }}>
                    이미 계정이 있으신가요?{' '}
                    <span
                      onClick={() => switchMode('login')}
                      style={{ color: COLORS.brand, fontWeight: 600, cursor: 'pointer' }}
                    >
                      로그인
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── FORGOT PASSWORD MODE ─── */}
          {mode === 'forgot' && (
            <>
              <button
                onClick={() => switchMode('login')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 13, color: COLORS.inkSub, fontFamily: 'inherit',
                  padding: 0, marginBottom: 24,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 4L6 8l4 4" stroke={COLORS.inkSub} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                로그인으로 돌아가기
              </button>

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: COLORS.inkMuted, marginBottom: 12 }}>
                RESET PASSWORD
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.025em' }}>
                비밀번호 재설정
              </h2>
              <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 8, lineHeight: 1.6 }}>
                가입한 학교 이메일로 재설정 링크를 보내드립니다.
              </p>

              {successMsg ? (
                <div style={{ marginTop: 28 }}>
                  <SuccessBanner msg={successMsg} />
                  <Btn
                    variant="outline" size="md" full
                    style={{ marginTop: 16 }}
                    onClick={() => switchMode('login')}
                  >
                    로그인 화면으로
                  </Btn>
                </div>
              ) : (
                <>
                  <div style={{ marginTop: 28 }}>
                    <InputField
                      label="학교 이메일"
                      placeholder="학번@dshs.kr"
                      value={email}
                      onChange={setEmail}
                      onEnter={handleForgotPassword}
                    />
                  </div>

                  {errorMsg && <div style={{ marginTop: 12 }}><ErrorBanner msg={errorMsg} /></div>}

                  <Btn
                    variant="brand" size="lg" full
                    style={{ marginTop: 20, opacity: isLoading ? 0.7 : 1 }}
                    onClick={handleForgotPassword} disabled={isLoading}
                  >
                    {isLoading ? '전송 중…' : '재설정 링크 보내기'}
                  </Btn>
                </>
              )}
            </>
          )}

          {/* Footer note */}
          <div
            style={{
              marginTop: 48, paddingTop: 20,
              borderTop: `1px solid ${COLORS.lineSoft}`,
              fontSize: 11, color: COLORS.inkMuted, lineHeight: 1.6,
            }}
          >
            본 서비스는 대전대신고등학교 재학생만 이용할 수 있습니다.<br />
            문의: 학생회 운영팀 · 25_kjy1012@dshs.kr
          </div>
        </div>
      </div>
    </div>
  )
}
