import { COLORS } from '../../tokens/tokens'

interface ProgressBarProps {
  value: number
  max?: number
  height?: number
  showLabel?: boolean
}

export default function ProgressBar({ value, max = 30, height = 8, showLabel = false }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100)
  const done = value >= max

  return (
    <div>
      <div
        style={{
          width: '100%',
          height,
          background: COLORS.lineSoft,
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: done ? COLORS.brand : COLORS.ink,
            borderRadius: 99,
            transition: 'width .2s',
          }}
        />
      </div>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.inkSub }}>
            <strong style={{ color: COLORS.ink, fontWeight: 700 }}>{value}표</strong> / {max}표
          </span>
          <span style={{ fontSize: 12, color: done ? COLORS.brand : COLORS.inkSub, fontWeight: 600 }}>
            {done ? '✓ 선정 완료' : `${max - value}표 남음`}
          </span>
        </div>
      )}
    </div>
  )
}
