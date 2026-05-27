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
    if (data) setProfile(data as Profile)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    // 이전에 sessionStorage를 storage로 사용했던 stale 세션 키를 정리.
    // 현재는 localStorage를 사용하므로 sessionStorage의 Supabase 토큰은 불필요.
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
      const projectRef = supabaseUrl.match(/\/\/([^.]+)\.supabase\.co/)?.[1]
      if (projectRef) {
        window.sessionStorage.removeItem(`sb-${projectRef}-auth-token`)
      }
    } catch { /* ignore */ }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!isSchoolEmail(normalizedEmail)) return { error: 'Invalid credentials.' }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error) return { error: error.message }
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

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: params.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          name:  name  ?? '',
          grade: grade  ? String(grade)    : '',
          class: classNum ? String(classNum) : '',
        },
      },
    })
    if (error) return { error: error.message }

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
