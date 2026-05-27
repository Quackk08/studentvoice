import { useHomeStats } from '../../hooks/useProposals'
import { COLORS } from '../../tokens/tokens'

export default function TrustStrip() {
  const { stats, loading } = useHomeStats()

  const items = [
    { n: stats.profiles,      l: '참여 학생' },
    { n: stats.active,        l: '진행 중 안건' },
    { n: stats.selected,      l: '전달된 안건' },
    { n: stats.doneThisMonth, l: '이번 달 반영' },
  ]

  return (
    <div
      className="py-6 px-15"
      style={{
        background: COLORS.surfaceRaised,
        borderTop: `1px solid ${COLORS.line}`,
        borderBottom: `1px solid ${COLORS.line}`,
      }}
    >
      <div className="flex items-center gap-12 justify-center">
        <span className="text-sm text-ink-muted font-medium tracking-widest">학교 공식 연계</span>
        {items.map((s, i) => (
          <div key={s.l} className="flex items-center gap-12">
            {i > 0 && <div className="w-0.25 h-6 bg-line" />}
            <div className="text-center">
              <div
                className="text-3xl font-black text-ink tracking-tight"
                style={{
                  opacity: loading ? 0.35 : 1,
                  transition: 'opacity .3s',
                  fontFeatureSettings: '"tnum"',
                  minWidth: 40,
                }}
              >
                {loading ? '—' : s.n.toLocaleString('ko-KR')}
              </div>
              <div className="text-2xs text-ink-muted mt-0.75">{s.l}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
