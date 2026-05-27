import { COLORS } from '../../tokens/tokens'

type BtnVariant = 'primary' | 'brand' | 'outline' | 'ghost' | 'danger'
type BtnSize = 'sm' | 'md' | 'lg'

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: BtnSize
  icon?: React.ReactNode
  full?: boolean
}

const VARIANTS: Record<BtnVariant, { bg: string; fg: string; bd: string }> = {
  primary: { bg: COLORS.ink,     fg: '#fff',       bd: COLORS.ink },
  brand:   { bg: COLORS.brand,   fg: '#fff',       bd: COLORS.brand },
  outline: { bg: COLORS.surface, fg: COLORS.ink,   bd: COLORS.line },
  ghost:   { bg: 'transparent',  fg: COLORS.ink,   bd: 'transparent' },
  danger:  { bg: COLORS.surface, fg: COLORS.warn,  bd: '#F2D6C2' },
}

const SIZES: Record<BtnSize, { px: number; py: number; fs: number; h: number; radius: number }> = {
  sm: { px: 12, py: 7,  fs: 12, h: 32, radius: 8  },
  md: { px: 18, py: 11, fs: 14, h: 42, radius: 10 },
  lg: { px: 22, py: 14, fs: 15, h: 52, radius: 10 },
}

export default function Btn({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  full = false,
  style,
  ...rest
}: BtnProps) {
  const v = VARIANTS[variant]
  const s = SIZES[size]

  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.bd}`,
        borderRadius: s.radius,
        padding: `${s.py}px ${s.px}px`,
        fontSize: s.fs,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '-0.01em',
        width: full ? '100%' : undefined,
        height: s.h,
        fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
