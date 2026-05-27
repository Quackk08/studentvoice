import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder'

// HTTP 헤더 값은 ISO-8859-1 범위(0x00–0xFF)만 허용됨.
// 사용자 메타데이터에 한글이 포함된 경우 Supabase 내부 fetch가
// "String contains non ISO-8859-1 code point" 오류를 발생시킬 수 있어
// 커스텀 fetch로 헤더를 안전하게 sanitize한다.
function sanitizeHeaderValue(value: string): string {
  // non-Latin1 문자(한글 등)를 제거
  return value.replace(/[^\x00-\xFF]/g, '')
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
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
