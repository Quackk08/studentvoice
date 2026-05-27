import { useNavigate } from 'react-router'
import { COLORS } from '../../tokens/tokens'
import MicMark from '../shared/MicMark'

const NAV_ANCHORS = [
  { label: '서비스 소개', id: 'features' },
  { label: '진행 방식',   id: 'how' },
  { label: '아카이브',    id: 'cta' },
]

export default function FabNav() {
  const navigate = useNavigate()

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-20 h-15 px-10 flex items-center gap-0"
      style={{
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${COLORS.line}`,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <div className="w-6.5 h-6.5 rounded bg-brand flex items-center justify-center">
          <MicMark size={14} color="#fff" />
        </div>
        <span className="text-lg font-bold text-ink tracking-tight">학생의 목소리</span>
      </div>

      {/* Nav links */}
      <div className="flex gap-0.5 ml-10">
        {NAV_ANCHORS.map(({ label, id }) => (
          <span
            key={id}
            onClick={() => scrollTo(id)}
            className="text-2xs text-ink-sub font-medium px-3.5 py-1.5 rounded-lg cursor-pointer tracking-tight hover:text-ink"
          >
            {label}
          </span>
        ))}
      </div>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-2.5">
        <span
          onClick={() => navigate('/login')}
          className="text-2xs text-ink-sub font-medium cursor-pointer px-3 hover:text-ink"
        >
          로그인
        </span>
        <button
          onClick={() => navigate('/login')}
          className="px-4 py-2 rounded-lg bg-ink text-white text-2xs font-bold cursor-pointer tracking-tight hover:opacity-90"
        >
          시작하기 →
        </button>
      </div>
    </nav>
  )
}
