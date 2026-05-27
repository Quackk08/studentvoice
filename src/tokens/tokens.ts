// Design Tokens — merged landing + app palettes

export const COLORS = {
  // App palette (inner screens)
  bg: '#F4F2EC',
  surface: '#FFFFFF',
  surfaceAlt: '#FAF8F3',
  surfaceRaised: '#FAFAF8',

  // Landing palette
  bgLanding: '#F9F9F7',

  // Text
  ink: '#171717',
  inkSub: '#5C5C5C',
  inkMuted: '#9A9A95',

  // Borders
  line: '#E6E3DA',
  lineSoft: '#EFEDE5',

  // Brand
  brand: '#0E5240',
  brandDark: '#0A3D30',
  brandSoft: '#E6EFEB',
  brandLight: '#E8F0EC',

  // Status
  warn: '#C2410C',
  warnSoft: '#FDEFE3',
  hold: '#7A6A2F',
  holdSoft: '#F4EFDB',
  fire: '#E5552B',
  fireSoft: '#FFF0E8',

  // Footer
  footerBg: '#004D3F',
} as const

export const TYPOGRAPHY = {
  fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
} as const

export type BadgeTone = 'brand' | 'brandSoft' | 'hold' | 'warn' | 'fire' | 'outline' | 'default'

export const BADGE_STYLES: Record<BadgeTone, { bg: string; color: string; border: string }> = {
  default:   { bg: '#F2F0E8',          color: COLORS.ink,      border: COLORS.line },
  brand:     { bg: COLORS.brand,       color: '#fff',           border: COLORS.brand },
  brandSoft: { bg: COLORS.brandSoft,   color: COLORS.brandDark, border: COLORS.brandSoft },
  warn:      { bg: COLORS.warnSoft,    color: COLORS.warn,      border: COLORS.warnSoft },
  hold:      { bg: COLORS.holdSoft,    color: COLORS.hold,      border: COLORS.holdSoft },
  outline:   { bg: 'transparent',      color: COLORS.ink,       border: COLORS.line },
  fire:      { bg: '#FDECE3',          color: COLORS.fire,      border: '#FDECE3' },
}
