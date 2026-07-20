import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder'
const REMEMBER_SESSION_KEY = 'studentvoice.remember-session'

function shouldRememberSession() {
  return typeof window !== 'undefined' && window.localStorage.getItem(REMEMBER_SESSION_KEY) === 'true'
}

export function setRememberSession(remember: boolean) {
  if (typeof window === 'undefined') return
  if (remember) window.localStorage.setItem(REMEMBER_SESSION_KEY, 'true')
  else window.localStorage.removeItem(REMEMBER_SESSION_KEY)
}

export function getRememberSession() {
  return shouldRememberSession()
}

const authStorage = typeof window === 'undefined' ? undefined : {
  getItem(key: string) {
    if (shouldRememberSession()) return window.localStorage.getItem(key)
    // localStorage fallback preserves sessions created before this setting existed.
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key)
  },
  setItem(key: string, value: string) {
    if (shouldRememberSession()) {
      window.localStorage.setItem(key, value)
      window.sessionStorage.removeItem(key)
    } else {
      window.sessionStorage.setItem(key, value)
      window.localStorage.removeItem(key)
    }
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  },
}

// HTTP 헤더 값은 ISO-8859-1 범위(0x00–0xFF)만 허용됨.
// supabase-js / postgrest-js 내부에서 new Headers() 생성 시 한글 등
// non-Latin1 문자가 헤더 값에 들어오면 브라우저가 즉시 TypeError를 던진다.
// safeFetch만으로는 fetch() 호출 이전에 이미 발생하는 에러를 막을 수 없으므로
// Headers.prototype.set/append 를 전역 패치하여 가장 이른 시점에 차단한다.
function sanitizeHeaderValue(value: string): string {
  // non-Latin1 문자(한글 등)를 제거
  return value.replace(/[^\x00-\xFF]/g, '')
}

if (typeof Headers !== 'undefined') {
  const _hSet = Headers.prototype.set
  Headers.prototype.set = function (name: string, value: string) {
    return _hSet.call(this, name, sanitizeHeaderValue(String(value)))
  }
  const _hAppend = Headers.prototype.append
  Headers.prototype.append = function (name: string, value: string) {
    return _hAppend.call(this, name, sanitizeHeaderValue(String(value)))
  }
}

const safeFetch: typeof globalThis.fetch = (input, init) => {
  if (init?.headers) {
    try {
      const raw = init.headers instanceof Headers
        ? Object.fromEntries((init.headers as Headers).entries())
        : (init.headers as Record<string, string>)

      const cleaned: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) {
        cleaned[k] = sanitizeHeaderValue(String(v))
      }
      init = { ...init, headers: cleaned }
    } catch {
      // sanitize 실패 시 헤더 없이 진행
      const { headers: _headers, ...rest } = init
      init = rest
    }
  }
  return globalThis.fetch(input, init)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: safeFetch,
  },
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
