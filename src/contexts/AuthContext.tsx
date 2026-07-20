import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isSchoolEmail, normalizeText, validatePassword } from '../lib/security'
import type { Profile } from '../types/database'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (params: { email: string; password: string; name?: string; grade?: number; classNum?: number }) => Promise<{ error: string | null; needsConfirmation?: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function isEmailVerified(user: User | null) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data ? data as Profile : null)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await fetchProfile(session.user.id)
      else setProfile(null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setLoading(true)
        // Auth 콜백 안에서 다른 Supabase 요청을 직접 기다리지 않는다.
        window.setTimeout(() => {
          fetchProfile(session.user.id).finally(() => setLoading(false))
        }, 0)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!isSchoolEmail(normalizedEmail)) return { error: 'Invalid credentials.' }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          return { error: '이메일 본인 인증을 먼저 완료해주세요.' }
        }
        return { error: error.message }
      }
      if (!isEmailVerified(data.user)) {
        await supabase.auth.signOut()
        return { error: '이메일 본인 인증을 먼저 완료해주세요.' }
      }
      return { error: null }
    } catch (e) {
      // 헤더 인코딩 오류 등 예기치 않은 fetch 오류 처리
      if (e instanceof TypeError) {
        try { await supabase.auth.signOut() } catch { /* ignore */ }
        return { error: '로그인 중 오류가 발생했습니다. 페이지를 새로고침 후 다시 시도해주세요.' }
      }
      return { error: '알 수 없는 오류가 발생했습니다.' }
    }
  }

  const signUp = async (params: {
    email: string
    password: string
    name?: string
    grade?: number
    classNum?: number
  }): Promise<{ error: string | null; needsConfirmation?: boolean }> => {
    const normalizedEmail = params.email.trim().toLowerCase()
    const passwordError = validatePassword(params.password)
    if (!isSchoolEmail(normalizedEmail)) return { error: 'Invalid email domain.' }
    if (passwordError) return { error: passwordError }

    const name = params.name ? normalizeText(params.name, 40) : undefined
    const grade = params.grade && params.grade >= 1 && params.grade <= 3 ? params.grade : undefined
    const classNum = params.classNum && params.classNum >= 1 && params.classNum <= 20 ? params.classNum : undefined
    if (!name || name.length < 2 || !grade || !classNum) {
      return { error: '이름, 학년, 반 정보를 모두 올바르게 입력해주세요.' }
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: params.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: {
          name:  name  ?? '',
          grade: grade  ? String(grade)    : '',
          class: classNum ? String(classNum) : '',
        },
      },
    })
    if (error) {
      const msg = error.message
      // Supabase가 빈 JSON {} 또는 빈 문자열로 내려오는 경우 → 메일 발송 실패
      if (!msg || msg === '{}' || msg === 'null' || msg.trim() === '') {
        return { error: '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' }
      }
      if (msg.toLowerCase().includes('sending') || msg.toLowerCase().includes('email')) {
        return { error: '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.' }
      }
      return { error: msg }
    }

    // Email confirmation required (Supabase 이메일 인증 ON인 경우)
    if (data.user && !data.session) {
      return { error: null, needsConfirmation: true }
    }

    // 바로 로그인된 경우 — 프로필 업데이트
    if (data.user && (name || grade || classNum)) {
      await supabase.from('profiles').update({
        ...(name      && { name }),
        ...(grade     && { grade }),
        ...(classNum  && { class: classNum }),
      }).eq('id', data.user.id)
    }

    if (data.session) {
      await supabase.auth.signOut()
    }

    return { error: null, needsConfirmation: true }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
