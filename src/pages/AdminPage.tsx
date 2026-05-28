import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import Btn from '../components/shared/Btn'
import { useAuth } from '../contexts/AuthContext'
import { useAdminQueue, useReportedProposals, adminUpdateStatus, dismissReport } from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import type { BadgeTone } from '../tokens/tokens'
import type { Proposal } from '../types/database'

// ── Helpers ──
function statusInfo(p: Proposal): [string, BadgeTone] {
  if (p.status === 'done')     return ['반영 완료', 'brandSoft']
  if (p.status === 'selected') return ['검토 대기', 'hold']
  if (p.status === 'rejected') return ['반려', 'warn']
  return ['처리 중', 'default']
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3.6e6)
  if (h < 1) return '방금 전'
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

// ── Sub-components ──
function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
        background: COLORS.surfaceAlt, color: COLORS.inkSub, border: `1px solid ${COLORS.line}`,
      }}
    >
      {children}
    </span>
  )
}

function KpiCard({
  label, value, detail, tone,
}: {
  label: string; value: string; detail: string; tone: 'ink' | 'warn' | 'brand'
}) {
  const color = tone === 'brand' ? COLORS.brand : tone === 'warn' ? COLORS.warn : COLORS.ink
  return (
    <div
      style={{
        background: COLORS.surface, border: `1px solid ${COLORS.line}`,
        borderRadius: 14, padding: 22,
      }}
    >
      <div style={{ fontSize: 12, color: COLORS.inkSub }}>{label}</div>
      <div
        style={{
          fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 8,
          color, fontFeatureSettings: '"tnum"', lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: tone === 'warn' ? COLORS.warn : COLORS.inkMuted, marginTop: 8, fontWeight: 500 }}>
        {detail}
      </div>
    </div>
  )
}

// ── Page ──
export default function AdminPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: queue, loading: queueLoading, refetch: refetchQueue } = useAdminQueue()
  const { data: reported, loading: repLoading, refetch: refetchReported } = useReportedProposals()

  const handleStatusChange = async (proposalId: string, newStatus: string) => {
    await adminUpdateStatus(proposalId, newStatus)
    refetchQueue()
  }

  // KPI derived from real data
  const waitingCount = queue.filter(p => p.status === 'selected').length
  const doneThisMonth = queue.filter(p => {
    if (p.status !== 'done') return false
    const d = new Date(p.updated_at ?? p.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const reportCount = reported.length

  return (
    <AppLayout active="home" isAdmin={profile?.is_admin}>
      {/* Header + KPI */}
      <section style={{ padding: '40px 48px 24px', background: COLORS.bg }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: COLORS.brand }}>
                  ADMIN CONSOLE
                </span>
                <Badge tone="brand">운영자</Badge>
              </div>
              <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                관리자 대시보드
              </h1>
              <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 10 }}>
                {profile?.name ?? profile?.email ?? '관리자'} · 학생회 운영팀
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="primary" size="md" onClick={() => navigate('/archive')}>아카이브 보기</Btn>
            </div>
          </div>

          {/* KPI cards */}
          <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <KpiCard
              label="검토 대기 안건"
              value={queueLoading ? '…' : String(waitingCount)}
              detail="30표 달성, 처리 필요"
              tone="ink"
            />
            <KpiCard
              label="신고 게시글"
              value={repLoading ? '…' : String(reportCount)}
              detail={reportCount > 0 ? '⚠ 처리 필요' : '이상 없음'}
              tone={reportCount > 0 ? 'warn' : 'ink'}
            />
            <KpiCard
              label="이번 달 반영"
              value={queueLoading ? '…' : String(doneThisMonth)}
              detail="반영 완료 처리됨"
              tone="brand"
            />
            <KpiCard
              label="전체 선정 안건"
              value={queueLoading ? '…' : String(queue.length)}
              detail="누적 총합"
              tone="ink"
            />
          </div>
        </div>
      </section>

      {/* Queue + Reports */}
      <section style={{ padding: '24px 48px 80px', background: COLORS.bg }}>
        <div
          style={{
            maxWidth: 1240, margin: '0 auto',
            display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20,
          }}
        >
          {/* Processing queue */}
          <div
            style={{
              background: COLORS.surface, border: `1px solid ${COLORS.line}`,
              borderRadius: 16, overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '20px 24px', borderBottom: `1px solid ${COLORS.lineSoft}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                선정 안건 처리 큐
                <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.inkMuted, fontWeight: 500 }}>
                  · 추천 30표↑
                </span>
              </h3>
              <span style={{ fontSize: 12, color: COLORS.inkSub }}>득표 순 ↓</span>
            </div>

            {queueLoading ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: COLORS.inkMuted, fontSize: 13 }}>
                불러오는 중…
              </div>
            ) : queue.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 13, color: COLORS.inkSub }}>처리 대기 중인 안건이 없습니다</div>
              </div>
            ) : (
              queue.map((q, i) => {
                const [statusLabel, statusTone] = statusInfo(q)
                // Extract author email from joined profiles if available
                const authorEmail = (q as unknown as { profiles?: { email: string } }).profiles?.email ?? '(익명)'
                return (
                  <div
                    key={q.id}
                    style={{ padding: '18px 24px', borderTop: i ? `1px solid ${COLORS.lineSoft}` : 'none' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <TagPill>{q.category}</TagPill>
                          <Badge tone={statusTone}>{statusLabel}</Badge>
                          <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{q.vote_count}표</span>
                        </div>
                        <div
                          style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, letterSpacing: '-0.015em', cursor: 'pointer' }}
                          onClick={() => navigate(`/proposals/${q.id}`)}
                        >
                          {q.title}
                        </div>
                        {q.is_anonymous ? (
                          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 6 }}>
                            ⓘ 발의자 {authorEmail}
                          </div>
                        ) : null}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {(
                          [
                            { label: '협의 중', status: 'selected' },
                            { label: '반영', status: 'done' },
                            { label: '반려', status: 'rejected' },
                          ] as const
                        ).map(({ label, status }, j) => (
                          <button
                            key={label}
                            onClick={() => handleStatusChange(q.id, status)}
                            style={{
                              padding: '6px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                              border: `1px solid ${j === 0 ? COLORS.ink : COLORS.line}`,
                              background: j === 0 ? COLORS.ink : COLORS.surface,
                              color: j === 0 ? '#fff' : COLORS.inkSub,
                              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em',
                              opacity: q.status === status ? 0.4 : 1,
                            }}
                            disabled={q.status === status}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Reported posts */}
          <div
            style={{
              background: COLORS.surface, border: `1px solid ${COLORS.line}`,
              borderRadius: 16, overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '20px 24px', borderBottom: `1px solid ${COLORS.lineSoft}`,
                background: reportCount > 0 ? COLORS.warnSoft : COLORS.surface,
              }}
            >
              <h3
                style={{
                  fontSize: 16, fontWeight: 700, margin: 0,
                  letterSpacing: '-0.02em',
                  color: reportCount > 0 ? COLORS.warn : COLORS.ink,
                }}
              >
                {reportCount > 0 ? '⚠ 신고된 게시글' : '신고된 게시글'}
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, opacity: 0.7 }}>
                  · {repLoading ? '…' : `${reportCount}건`}
                </span>
              </h3>
              <p style={{ fontSize: 11.5, color: reportCount > 0 ? COLORS.warn : COLORS.inkMuted, margin: '4px 0 0', opacity: 0.85 }}>
                {reportCount > 0
                  ? '신고 3회 이상 게시글입니다. 24시간 내 처리해주세요.'
                  : '신고된 게시글이 없습니다.'}
              </p>
            </div>

            {repLoading ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: COLORS.inkMuted, fontSize: 13 }}>
                불러오는 중…
              </div>
            ) : reported.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>🛡️</div>
                <div style={{ fontSize: 13, color: COLORS.inkSub }}>신고된 게시글이 없습니다</div>
              </div>
            ) : (
              reported.map(({ proposal: r, reportCount: cnt, reason }, i) => (
                <div
                  key={r.id}
                  style={{ padding: '18px 24px', borderTop: i ? `1px solid ${COLORS.lineSoft}` : 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Badge tone="warn">신고 {cnt}회</Badge>
                    <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{relativeTime(r.created_at)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 13.5, fontWeight: 600, color: COLORS.ink, letterSpacing: '-0.01em',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.inkSub, marginTop: 4 }}>
                    사유: {reason || '미입력'}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                    <Btn
                      variant="outline" size="sm"
                      style={{ flex: 1, height: 30, fontSize: 11.5 }}
                      onClick={() => navigate(`/proposals/${r.id}`)}
                    >
                      원문 보기
                    </Btn>
                    <Btn
                      variant="outline" size="sm"
                      style={{ flex: 1, height: 30, fontSize: 11.5, color: COLORS.brand, borderColor: COLORS.brand }}
                      onClick={async () => {
                        // SECURITY FIX P3 (2025-05-28): 실수 방지를 위한 확인 다이얼로그 추가
                        if (!window.confirm('이 게시글의 모든 신고를 해제하시겠습니까?')) return
                        await dismissReport(r.id)
                        refetchReported()
                      }}
                    >
                      신고 해제
                    </Btn>
                    <Btn
                      variant="primary" size="sm"
                      style={{ flex: 1, height: 30, fontSize: 11.5 }}
                      onClick={() => handleStatusChange(r.id, 'blinded')}
                    >
                      블라인드
                    </Btn>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </AppLayout>
  )
}
