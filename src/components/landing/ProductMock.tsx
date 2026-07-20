import { COLORS } from '../../tokens/tokens'
import MicMark from '../shared/MicMark'

interface MiniCardProps {
  title: string
  cat: string
  votes: number
  badge?: string
  max?: number
}

function MiniCard({ title, cat, votes, badge, max = 30 }: MiniCardProps) {
  const pct = Math.min(100, (votes / max) * 100)

  return (
    <div
      className="bg-white rounded-3.5 p-4.5 border text-sm"
      style={{ border: `1px solid ${COLORS.line}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      <div className="flex justify-between items-center mb-2.5">
        <span
          className="text-2xs font-bold px-1.75 py-0.5 rounded"
          style={{ background: COLORS.surfaceRaised, color: COLORS.inkSub, border: `1px solid ${COLORS.line}` }}
        >
          {cat}
        </span>
        {badge && (
          <span className="text-2xs px-1.75 py-0.5 rounded-full font-bold" style={{ background: COLORS.fireSoft, color: '#C45D1A' }}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-sm font-bold text-ink leading-snug mb-3">
        {title}
      </div>
      <div className="h-1 bg-line-soft rounded-full overflow-hidden">
        <div className="h-full bg-ink rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-2 text-2xs text-ink-muted">
        <span>{votes}표</span>
        <span>/ {max}표</span>
      </div>
    </div>
  )
}

export default function ProductMock() {
  return (
    <div
      className="rounded-5 overflow-hidden border"
      style={{
        border: `1px solid ${COLORS.line}`,
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.14), 0 4px 24px -4px rgba(0,0,0,0.08)',
        background: COLORS.bg,
      }}
    >
      {/* Mock header bar */}
      <div
        className="bg-white border-b px-3 sm:px-6 py-3.5 flex items-center gap-4"
        style={{ borderBottom: `1px solid ${COLORS.line}` }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-5.5 h-5.5 rounded bg-brand flex items-center justify-center">
            <MicMark size={10} color="#fff" />
          </div>
          <span className="text-sm font-bold text-ink">학생의 목소리</span>
        </div>
        <nav className="hidden sm:flex gap-5 text-sm text-ink-sub">
          <span className="font-bold text-ink" style={{ borderBottom: `2px solid ${COLORS.brand}`, paddingBottom: '2px' }}>홈</span>
          <span>답변 · 아카이브</span>
          <span>의견 제안</span>
        </nav>
        <div className="ml-auto flex gap-2 items-center">
          <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center text-2xs font-bold">
            HG
          </div>
        </div>
      </div>

      {/* Mock content */}
      <div className="p-3 sm:p-7" style={{ background: COLORS.bg }}>
        {/* Popular section */}
        <div
          className="text-2xs font-bold tracking-wide mb-3"
          style={{ color: COLORS.brand }}
        >
          인기 이슈 — 30표 달성 시 학생회로 자동 전달
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <MiniCard title="도서관 4층 자습실에 콘센트 추가 설치" cat="#시설" votes={28} badge="🔥 2표 남음" />
          <MiniCard title="월 1회 다문화 메뉴 도입 제안" cat="#급식" votes={24} />
          <MiniCard title="동절기 후드티 착용 허용 (12-2월)" cat="#교칙" votes={21} />
        </div>

        {/* Selected list snippet */}
        <div
          className="bg-white rounded-3.5 border overflow-hidden"
          style={{ border: `1px solid ${COLORS.line}` }}
        >
          <div
            className="px-4 py-3 border-b flex justify-between"
            style={{ borderBottom: `1px solid ${COLORS.lineSoft}` }}
          >
            <span className="text-sm font-bold text-ink">선정된 안건</span>
            <span className="text-2xs text-ink-muted">추천수 높은 순</span>
          </div>
          {[
            { t: '점심시간 5분 연장', c: '#학사', v: 89, s: '교무실 협의 중', st: '#6B5A12', sb: '#FFF8E8' },
            { t: '체육관 농구 골대 그물 교체', c: '#시설', v: 47, s: '반영 완료', st: COLORS.brand, sb: COLORS.brandLight },
            { t: '교내 자판기 음료 종류 다양화', c: '#시설', v: 41, s: '반영 완료', st: COLORS.brand, sb: COLORS.brandLight },
          ].map((r, i) => (
            <div
              key={i}
              className="px-4 py-2.75 flex items-center gap-3.5"
              style={{ borderTop: i > 0 ? `1px solid ${COLORS.lineSoft}` : 'none' }}
            >
              <span
                className="text-2xs font-bold px-2 py-0.75 rounded"
                style={{ background: COLORS.surfaceRaised, color: COLORS.inkSub, border: `1px solid ${COLORS.line}` }}
              >
                {r.c}
              </span>
              <span className="text-sm font-bold text-ink flex-1 tracking-tight">{r.t}</span>
              <span
                className="hidden sm:inline text-2xs px-2 py-0.75 rounded-full font-bold whitespace-nowrap"
                style={{ background: r.sb, color: r.st }}
              >
                {r.s}
              </span>
              <span className="hidden sm:inline text-sm text-ink-muted">{r.v}표</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
