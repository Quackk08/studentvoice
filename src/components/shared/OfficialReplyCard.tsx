import type { OfficialReply, ProposalStatus } from '../../types/database'
import { COLORS } from '../../tokens/tokens'

interface OfficialReplyCardProps {
  reply: OfficialReply
  compact?: boolean
}

export function getDisplayableOfficialReply(
  replies: OfficialReply[] | OfficialReply | null | undefined,
  proposalStatus: ProposalStatus | undefined,
) {
  if (!proposalStatus || proposalStatus === 'active' || proposalStatus === 'blinded') return null
  const replyList = Array.isArray(replies) ? replies : replies ? [replies] : []
  return replyList.find(reply => (
    reply.content.trim().length >= 3
    && reply.signed_by.trim().length >= 2
  )) ?? null
}

function formatReplyDate(reply: OfficialReply) {
  const value = reply.updated_at ?? reply.created_at
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function OfficialReplyCard({ reply, compact = false }: OfficialReplyCardProps) {
  const dateLabel = formatReplyDate(reply)
  const wasUpdated = Boolean(reply.updated_at && reply.updated_at !== reply.created_at)

  return (
    <section
      aria-label="학생회 공식 답변"
      style={{
        padding: compact ? '18px 20px' : '24px 26px',
        background: COLORS.brandSoft,
        border: `1px solid ${COLORS.brand}45`,
        borderLeft: `4px solid ${COLORS.brand}`,
        borderRadius: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: compact ? 12 : 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: COLORS.brand, marginBottom: 4 }}>
            OFFICIAL REPLY
          </div>
          <h2 style={{ margin: 0, fontSize: compact ? 15 : 18, lineHeight: 1.35, color: COLORS.ink }}>
            학생회 공식 답변
          </h2>
        </div>
        <span style={{ flexShrink: 0, padding: '5px 9px', borderRadius: 999, background: COLORS.surface, color: COLORS.brandDark, fontSize: 11, fontWeight: 700 }}>
          답변 등록
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: compact ? 13 : 15,
          lineHeight: compact ? 1.7 : 1.8,
          color: COLORS.ink,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {reply.content}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px 16px',
          marginTop: compact ? 14 : 18,
          paddingTop: compact ? 12 : 14,
          borderTop: `1px solid ${COLORS.brand}30`,
          fontSize: 11,
          color: COLORS.inkSub,
        }}
      >
        <span>
          답변자 <strong style={{ color: COLORS.ink, fontWeight: 800 }}>{reply.signed_by}</strong>
        </span>
        {dateLabel && <span>{wasUpdated ? '최종 수정' : '등록'} {dateLabel}</span>}
      </div>
    </section>
  )
}
