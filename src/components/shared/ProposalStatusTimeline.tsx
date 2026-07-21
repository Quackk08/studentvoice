import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONES } from '../../lib/proposalStatus'
import { COLORS } from '../../tokens/tokens'
import type { ProposalStatusEvent } from '../../types/database'
import Badge from './Badge'

function formatEventDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function ProposalStatusTimeline({ events }: { events: ProposalStatusEvent[] }) {
  if (events.length === 0) return null

  return (
    <section
      aria-label="안건 처리 이력"
      style={{
        marginTop: 28,
        padding: '22px 24px',
        border: `1px solid ${COLORS.line}`,
        borderRadius: 14,
        background: COLORS.surfaceAlt,
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: COLORS.inkMuted, marginBottom: 4 }}>
          WORKFLOW HISTORY
        </div>
        <h2 style={{ margin: 0, fontSize: 17, color: COLORS.ink }}>처리 진행 이력</h2>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {events.map((event, index) => (
          <article
            key={event.id}
            style={{
              position: 'relative',
              paddingLeft: 22,
              paddingBottom: index === events.length - 1 ? 0 : 4,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                top: 7,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: COLORS.brand,
                boxShadow: `0 0 0 4px ${COLORS.brandSoft}`,
              }}
            />
            {index < events.length - 1 && (
              <span
                aria-hidden="true"
                style={{ position: 'absolute', left: 4, top: 18, bottom: -12, width: 1, background: COLORS.line }}
              />
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Badge tone={PROPOSAL_STATUS_TONES[event.to_status]}>{PROPOSAL_STATUS_LABELS[event.to_status]}</Badge>
              {event.source === 'system' && <Badge tone="outline">자동 처리</Badge>}
              <time dateTime={event.created_at} style={{ fontSize: 11, color: COLORS.inkMuted }}>
                {formatEventDate(event.created_at)}
              </time>
            </div>
            {event.public_message && (
              <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.7, color: COLORS.inkSub, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {event.public_message}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
