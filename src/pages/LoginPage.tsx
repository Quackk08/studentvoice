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
      <div className="text-xs font-semibold text-ink mb-2" style={{ letterSpacing: '-0.01em' }}>
        {label}
      </div>
      <div
        className="flex items-center gap-2 rounded-2.5 bg-surface px-3.5 h-12 transition-colors"
        style={{ border: `1px solid ${error ? COLORS.warn : COLORS.line}` }}
      >
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter?.()}
          className="flex-1 border-none outline-none text-base text-ink font-sans bg-transparent h-full"
        />
        {suffix}
      </div>
      {hint && (
        <div className={`text-xs mt-1.5 ${error ? 'text-warn' : 'text-ink-muted'}`}>{hint}</div>
      )}
    </div>
  )
}

// ── GradeClassPicker ─────────────────────────────────────────
function GradeClassPicker({
  grade, classNum, onGrade, onClass,
}: { grade: number | null; classNum: string; onGrade: (g: number) => void; onClass: (c: string) => void }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'auto 1fr' }}>
      <div>
        <div className="text-xs font-semibold text-ink mb-2">학년</div>
        <div className="flex gap-1.5">
          {[1, 2, 3].map(g => (
            <button
              key={g}
              onClick={() => onGrade(g)}
              className="w-11 h-11 rounded-2.5 border-none font-bold cursor-pointer font-sans transition-all"
              style={{
                background: grade === g ? COLORS.ink : COLORS.surfaceAlt,
                color: grade === g ? '#fff' : COLORS.inkSub,
                fontSize: 15, letterSpacing: '-0.01em',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-ink mb-2">반</div>
        <div
          className="flex items-center border border-line rounded-2.5 bg-surface px-3.5 h-11"
        >
          <input
            type="number"
            placeholder="반 번호"
            value={classNum}
            min={1} max={20}
            onChange={e => onClass(e.target.value)}
            className="flex-1 border-none outline-none text-base text-ink font-sans bg-transparent"
          />
          <span className="text-xs text-ink-muted">반</span>
        </div>
      </div>
    </div>
  )
}

// ── EyeToggle ──────────────────────────────────────────────────
function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="border-none bg-none cursor-pointer p-0 flex flex-shrink-0"
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

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      className="px-3.5 py-2.5 rounded-2 text-xs text-warn"
      style={{ background: COLORS.warnSoft, border: `1px solid ${COLORS.warn}33` }}
    >
      {msg}
    </div>
  )
}

function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div
      className="px-3.5 py-3 rounded-2 text-sm text-brand font-semibold"
      style={{ background: COLORS.brandSoft, border: `1px solid ${COLORS.brand}33`, lineHeight: 1.55 }}
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

  useEffect(() => {
    if (loading) return
    if (user && isEmailVerified(user)) {
      navigate(profile?.agreed_to_guidelines ? '/home' : '/guidelines', { replace: true })
    }
  }, [user, profile, loading])

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [confirmPw, setConfirmPw]   = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [name, setName]             = useState('')
  const [grade, setGrade]           = useState<number | null>(null)
  const [classNum, setClassNum]     = useState('')
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [remember, setRemember]   = useState(false)

  const switchMode = (m: 'login' | 'signup' | 'forgot') => {
    setMode(m); setErrorMsg(null); setSuccessMsg(null)
  }

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

  const handleSignup = async () => {
    setErrorMsg(null)
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
    <div className="min-h-screen flex flex-col lg:grid bg-surface font-sans text-ink tracking-snug" style={{ gridTemplateColumns: '1fr 1fr' }}>

      {/* ── Left visual — desktop only ── */}
      <div
        className="hidden lg:flex flex-col relative overflow-hidden px-14 pt-14 pb-12"
        style={{ background: COLORS.bg }}
      >
        <div className="flex items-center gap-2.5">
          <MicMark size={26} color={COLORS.ink} />
          <div className="flex flex-col leading-none">
            <span className="font-bold text-lg text-ink" style={{ letterSpacing: '-0.01em' }}>학생의 목소리</span>
            <span className="text-xs text-ink-sub mt-0.5" style={{ letterSpacing: '0.02em' }}>대전대신고등학교</span>
          </div>
        </div>

        <div
          className="absolute pointer-events-none select-none"
          style={{
            left: -20, bottom: 80,
            fontSize: 220, fontWeight: 800, lineHeight: 0.85,
            color: 'rgba(14, 82, 64, 0.06)', letterSpacing: '-0.06em',
          }}
        >
          Voice<br />of<br />Daeshin
        </div>

        <div className="mt-auto relative z-10">
          <div className="text-xs font-bold text-brand mb-4.5" style={{ letterSpacing: '0.18em' }}>
            DAESHIN HIGH SCHOOL · 2026
          </div>
          <h1 className="text-11xl font-extrabold leading-none m-0 text-ink" style={{ letterSpacing: '-0.035em' }}>
            학교를 바꾸는<br />가장 작은 한 표.
          </h1>
          <p className="text-base text-ink-sub mt-5.5 max-w-[380px]" style={{ lineHeight: 1.65 }}>
            학생이 직접 제안하고, 30표가 모이면 학생회를 통해 학교에 전달됩니다.
            작은 의견이 학교의 내일이 되도록.
          </p>
        </div>
      </div>

      {/* ── Right form ── */}
      <div className="flex flex-col items-center justify-center px-6 py-10 lg:px-12 lg:py-12 overflow-y-auto">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8 self-start">
          <MicMark size={24} color={COLORS.ink} />
          <div className="flex flex-col leading-none">
            <span className="font-bold text-lg text-ink" style={{ letterSpacing: '-0.01em' }}>학생의 목소리</span>
            <span className="text-xs text-ink-sub mt-0.5">대전대신고등학교</span>
          </div>
        </div>

        <div className="w-full max-w-[380px]">
          {/* Mode toggle */}
          {mode !== 'forgot' && (
            <div
              className="flex gap-0 mb-8 border border-line rounded-3 p-1 bg-surface-alt"
            >
              {(['login', 'signup'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className="flex-1 h-9.5 rounded-2.25 border-none cursor-pointer font-sans transition-all"
                  style={{
                    background: mode === m ? COLORS.surface : 'transparent',
                    color: mode === m ? COLORS.ink : COLORS.inkSub,
                    fontSize: 13, fontWeight: mode === m ? 700 : 500,
                    letterSpacing: '-0.01em',
                    boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
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
              <div className="text-xs font-bold text-ink-muted mb-3" style={{ letterSpacing: '0.18em' }}>SIGN IN</div>
              <h2 className="text-6xl font-bold m-0" style={{ letterSpacing: '-0.025em' }}>학생 계정으로 로그인</h2>
              <p className="text-sm text-ink-sub mt-2" style={{ lineHeight: 1.6 }}>학교 이메일로 접속하세요.</p>

              <div className="mt-7 flex flex-col gap-3.5">
                <InputField label="이메일" placeholder="학번@dshs.kr" value={email} onChange={setEmail} onEnter={handleLogin} />
                <InputField
                  label="비밀번호" type={showPass ? 'text' : 'password'} placeholder="비밀번호 입력"
                  value={password} onChange={setPassword} onEnter={handleLogin}
                  suffix={<EyeToggle show={showPass} onToggle={() => setShowPass(!showPass)} />}
                />
              </div>

              {errorMsg && <div className="mt-3"><ErrorBanner msg={errorMsg} /></div>}

              <Btn
                variant="brand" size="lg" full
                style={{ marginTop: 20, opacity: isLoading ? 0.7 : 1 }}
                onClick={handleLogin} disabled={isLoading}
              >
                {isLoading ? '로그인 중…' : '로그인'}
              </Btn>

              <div className="mt-4 flex justify-between items-center text-xs text-ink-sub">
                <label className="flex items-center gap-1.75 cursor-pointer" onClick={() => setRemember(!remember)}>
                  <span
                    className="w-3.5 h-3.5 rounded-0.75 border-[1.4px] inline-flex items-center justify-center"
                    style={{
                      borderColor: remember ? COLORS.brand : COLORS.inkMuted,
                      background: remember ? COLORS.brand : 'transparent',
                    }}
                  >
                    {remember && <span className="text-white font-bold" style={{ fontSize: 9 }}>✓</span>}
                  </span>
                  로그인 상태 유지
                </label>
                <span onClick={() => switchMode('signup')} className="text-brand font-semibold cursor-pointer">
                  계정이 없으신가요? →
                </span>
              </div>

              <div className="mt-2.5 text-right">
                <span onClick={() => switchMode('forgot')} className="text-xs text-ink-muted cursor-pointer underline">
                  비밀번호를 잊으셨나요?
                </span>
              </div>
            </>
          )}

          {/* ─── SIGNUP MODE ─── */}
          {mode === 'signup' && (
            <>
              <div className="text-xs font-bold text-ink-muted mb-3" style={{ letterSpacing: '0.18em' }}>SIGN UP</div>
              <h2 className="text-6xl font-bold m-0" style={{ letterSpacing: '-0.025em' }}>재학생 계정 만들기</h2>
              <p className="text-sm text-ink-sub mt-2" style={{ lineHeight: 1.6 }}>대전대신고 이메일(@dshs.kr)로 가입하세요.</p>

              {successMsg ? (
                <div className="mt-7">
                  <SuccessBanner msg={successMsg} />
                  <Btn variant="outline" size="md" full style={{ marginTop: 16 }} onClick={() => switchMode('login')}>
                    로그인 화면으로
                  </Btn>
                </div>
              ) : (
                <>
                  <div className="mt-7 flex flex-col gap-3.5">
                    <InputField label="학교 이메일" placeholder="학번@dshs.kr" value={email} onChange={setEmail} />
                    <InputField
                      label="비밀번호" type={showPass ? 'text' : 'password'} placeholder="8자 이상"
                      value={password} onChange={setPassword}
                      suffix={<EyeToggle show={showPass} onToggle={() => setShowPass(!showPass)} />}
                      hint="영문, 숫자, 기호를 조합하면 더 안전합니다."
                    />
                    <InputField
                      label="비밀번호 확인" type={showConfirm ? 'text' : 'password'} placeholder="비밀번호 다시 입력"
                      value={confirmPw} onChange={setConfirmPw}
                      error={confirmPw.length > 0 && confirmPw !== password}
                      hint={confirmPw.length > 0 && confirmPw !== password ? '비밀번호가 일치하지 않습니다.' : undefined}
                      suffix={<EyeToggle show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />}
                    />
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-px bg-line-soft" />
                      <span className="text-xs text-ink-muted">선택 정보</span>
                      <div className="flex-1 h-px bg-line-soft" />
                    </div>
                    <InputField label="이름" placeholder="홍길동 (마이페이지에 표시)" value={name} onChange={setName} />
                    <GradeClassPicker grade={grade} classNum={classNum} onGrade={setGrade} onClass={setClassNum} />
                  </div>

                  {errorMsg && <div className="mt-3"><ErrorBanner msg={errorMsg} /></div>}

                  <Btn
                    variant="brand" size="lg" full
                    style={{ marginTop: 20, opacity: isLoading ? 0.7 : 1 }}
                    onClick={handleSignup} disabled={isLoading}
                  >
                    {isLoading ? '가입 중…' : '가입하기'}
                  </Btn>

                  <div className="mt-3.5 text-center text-xs text-ink-sub">
                    이미 계정이 있으신가요?{' '}
                    <span onClick={() => switchMode('login')} className="text-brand font-semibold cursor-pointer">
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
                className="inline-flex items-center gap-1.25 border-none bg-none cursor-pointer text-sm text-ink-sub font-sans p-0 mb-6"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 4L6 8l4 4" stroke={COLORS.inkSub} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                로그인으로 돌아가기
              </button>

              <div className="text-xs font-bold text-ink-muted mb-3" style={{ letterSpacing: '0.18em' }}>RESET PASSWORD</div>
              <h2 className="text-6xl font-bold m-0" style={{ letterSpacing: '-0.025em' }}>비밀번호 재설정</h2>
              <p className="text-sm text-ink-sub mt-2" style={{ lineHeight: 1.6 }}>
                가입한 학교 이메일로 재설정 링크를 보내드립니다.
              </p>

              {successMsg ? (
                <div className="mt-7">
                  <SuccessBanner msg={successMsg} />
                  <Btn variant="outline" size="md" full style={{ marginTop: 16 }} onClick={() => switchMode('login')}>
                    로그인 화면으로
                  </Btn>
                </div>
              ) : (
                <>
                  <div className="mt-7">
                    <InputField
                      label="학교 이메일" placeholder="학번@dshs.kr"
                      value={email} onChange={setEmail} onEnter={handleForgotPassword}
                    />
                  </div>
                  {errorMsg && <div className="mt-3"><ErrorBanner msg={errorMsg} /></div>}
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
          <div className="mt-12 pt-5 border-t border-line-soft text-xs text-ink-muted" style={{ lineHeight: 1.6 }}>
            본 서비스는 대전대신고등학교 재학생만 이용할 수 있습니다.<br />
            문의: 학생회 운영팀 · 25_kjy1012@dshs.kr
          </div>
        </div>
      </div>
    </div>
  )
}
