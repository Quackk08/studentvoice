import { Component, type ErrorInfo, type ReactNode } from 'react'
import { COLORS } from '../../tokens/tokens'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('StudentVoice render error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: COLORS.bg,
          fontFamily: 'Pretendard Variable, Pretendard, sans-serif',
        }}
      >
        <section style={{ width: 'min(100%, 460px)', padding: 30, border: `1px solid ${COLORS.line}`, borderRadius: 18, background: COLORS.surface, textAlign: 'center' }}>
          <div aria-hidden="true" style={{ fontSize: 30, marginBottom: 12 }}>↻</div>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.ink }}>화면을 표시하지 못했습니다</h1>
          <p style={{ margin: '12px 0 22px', color: COLORS.inkSub, fontSize: 13, lineHeight: 1.65 }}>
            일시적인 화면 오류가 발생했습니다. 새로고침한 뒤에도 계속되면 학생회 운영팀에 알려주세요.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button type="button" onClick={() => window.location.reload()} style={{ height: 40, padding: '0 16px', border: 0, borderRadius: 9, background: COLORS.ink, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              새로고침
            </button>
            <button type="button" onClick={() => window.location.assign('/home')} style={{ height: 40, padding: '0 16px', border: `1px solid ${COLORS.line}`, borderRadius: 9, background: COLORS.surface, color: COLORS.ink, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              홈으로 이동
            </button>
          </div>
        </section>
      </main>
    )
  }
}
