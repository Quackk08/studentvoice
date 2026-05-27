interface MicMarkProps {
  size?: number
  color?: string
}

export default function MicMark({ size = 28, color = '#0E5240' }: MicMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="10.5" y="4" width="7" height="13" rx="3.5" stroke={color} strokeWidth="1.6"/>
      <path d="M6.5 13.5C6.5 17.6421 9.85786 21 14 21C18.1421 21 21.5 17.6421 21.5 13.5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M14 21V25M10.5 25H17.5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}
