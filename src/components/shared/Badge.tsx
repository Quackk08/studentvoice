import { BADGE_STYLES, type BadgeTone } from '../../tokens/tokens'

interface BadgeProps {
  children: React.ReactNode
  tone?: BadgeTone
}

export default function Badge({ children, tone = 'default' }: BadgeProps) {
  const s = BADGE_STYLES[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 9px',
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
