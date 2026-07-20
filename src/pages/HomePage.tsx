import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import ProgressBar from '../components/shared/ProgressBar'
import { useAuth } from '../contexts/AuthContext'
import { usePopularProposals, useSelectedProposals, useHomeStats } from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import { getProposalStatusLabel, getProposalStatusTone } from '../lib/proposalStatus'
import type { Proposal } from '../types/database'

function relativeTime(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60)        return '방금 전'
  if (diff < 3600)      return `${Math.floor(diff/60)}분 전`
  if (diff < 86400)     return `${Math.floor(diff/3600)}시간 전`
  if (diff < 86400*7)   return `${Math.floor(diff/86400)}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

// ── Sub-components ──
function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 4,
        background: COLORS.surfaceAlt,
        color: COLORS.inkSub,
        border: `1px solid ${COLORS.line}`,
      }}
    >
      {children}
    </span>
  )
}

function Stat({ n, l, tone, loading }: { n: string; l: string; tone?: 'brand'; loading?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: tone === 'brand' ? COLORS.brand : COLORS.ink,
          fontFeatureSettings: '"tnum"',
          opacity: loading ? 0.4 : 1,
        }}
      >
        {loading ? '—' : n}
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkSub, marginTop: 6 }}>{l}</div>
    </div>
  )
}

function SectionHeader({
  kicker,
  title,
  sub,
  action,
}: {
  kicker: string
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.16em',
            color: COLORS.brand,
            marginBottom: 10,
          }}
        >
          {kicker}
        </div>
        <h2 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: '-0.028em' }}>{title}</h2>
        {sub && (
          <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 8, margin: '8px 0 0' }}>{sub}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

interface PopularCardData {
  cat: string; votes: number; max: number; title: string; body: string; author: string; when: string; comments: number
}

function PopularCard({
  d,
  large = false,
  onClick,
}: {
  d: PopularCardData
  large?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 16,
        padding: large ? 28 : 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: large ? 280 : 240,
        position: 'relative',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <TagPill>{d.cat}</TagPill>
        <Badge tone="fire">🔥 인기 급상승</Badge>
      </div>
      <h3
        style={{
          fontSize: large ? 22 : 17,
          fontWeight: 700,
          margin: 0,
          lineHeight: 1.35,
          letterSpacing: '-0.02em',
          color: COLORS.ink,
        }}
      >
        {d.title}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: COLORS.inkSub,
          lineHeight: 1.6,
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: large ? 3 : 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {d.body}
      </p>
      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, color: COLORS.inkSub }}>선정까지</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>
            {d.votes}
            <span style={{ color: COLORS.inkMuted, fontWeight: 500 }}> / {d.max}표</span>
          </span>
        </div>
        <ProgressBar value={d.votes} max={d.max} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            fontSize: 11.5,
            color: COLORS.inkMuted,
          }}
        >
          <span>
            {d.author} · {d.when}
          </span>
          <span>💬 {d.comments}</span>
        </div>
      </div>
    </button>
  )
}

function EmptyPopular({ onWrite }: { onWrite: () => void }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        padding: '64px 0',
        textAlign: 'center',
        background: COLORS.surface,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 14 }}>📣</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>
        아직 인기 안건이 없습니다
      </div>
      <div style={{ fontSize: 13, color: COLORS.inkSub, marginBottom: 20 }}>
        추천 20표 이상 안건이 생기면 여기에 표시됩니다.
      </div>
      <button
        onClick={onWrite}
        style={{
          padding: '10px 20px', borderRadius: 99, fontSize: 13, fontWeight: 600,
          background: COLORS.ink, color: '#fff', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        첫 번째 안건 제안하기
      </button>
    </div>
  )
}

function EmptySelected() {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: COLORS.surface,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
      <div style={{ fontSize: 14, color: COLORS.inkSub }}>
        아직 선정된 안건이 없습니다. 30표를 모으면 자동으로 학생회로 전달됩니다.
      </div>
    </div>
  )
}

// ── Page ──
export default function HomePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: popularData, loading: popularLoading } = usePopularProposals()
  const { data: selectedData, loading: selectedLoading } = useSelectedProposals(5)
  const { stats, loading: statsLoading } = useHomeStats()

  const popular = popularLoading ? [] : popularData
  const selected = selectedLoading ? [] : selectedData

  const toPopularCard = (d: Proposal) => ({
    cat: d.category,
    votes: d.vote_count,
    max: 30,
    title: d.title,
    body: d.body,
    author: d.is_anonymous ? `익명 · ${d.author_grade ?? '?'}학년` : (d.author_name ?? `${d.author_grade ?? '?'}학년 학생`),
    when: relativeTime(d.created_at),
    comments: d.comment_count,
  })

  return (
    <AppLayout active="home" isAdmin={profile?.is_admin ?? false}>
      <div style={{ position: 'relative', flex: 1 }}>
        {/* Hero */}
        <section className="responsive-section" style={{ padding: '48px 48px 24px', background: COLORS.bg }}>
          <div className="home-hero-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  color: COLORS.brand,
                  marginBottom: 14,
                }}
              >
                {(() => {
                  const now = new Date()
                  const year = now.getFullYear()
                  const month = now.getMonth() + 1
                  const season =
                    month >= 3 && month <= 5 ? 'SPRING' :
                    month >= 6 && month <= 8 ? 'SUMMER' :
                    month >= 9 && month <= 11 ? 'AUTUMN' : 'WINTER'
                  return `VOICE OF DAESHIN — ${year} ${season}`
                })()}
              </div>
              <h1
                className="home-title"
                style={{
                  fontSize: 56,
                  fontWeight: 800,
                  lineHeight: 1.0,
                  margin: 0,
                  letterSpacing: '-0.035em',
                  color: COLORS.ink,
                }}
              >
                오늘, 학교에<br />한 표를 던지세요.
              </h1>
            </div>

            {/* Stats widget — real data */}
            <div
              className="home-stats"
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 14,
                padding: '18px 22px',
                display: 'flex',
                gap: 32,
                alignItems: 'center',
              }}
            >
              <Stat n={String(stats.active)}        l="진행 중 안건"  loading={statsLoading} />
              <div style={{ width: 1, height: 36, background: COLORS.lineSoft }} />
              <Stat n={String(stats.selected)}      l="선정된 안건"  loading={statsLoading} />
              <div style={{ width: 1, height: 36, background: COLORS.lineSoft }} />
              <Stat n={String(stats.doneThisMonth)} l="이번 달 반영" tone="brand" loading={statsLoading} />
            </div>
          </div>
        </section>

        {/* Popular issues */}
        <section className="responsive-section" style={{ padding: '36px 48px 24px', background: COLORS.bg }}>
          <SectionHeader
            kicker="인기 이슈"
            title="곧 선정될 안건들"
            sub="추천 20표 이상 · 30표 달성 시 학생회로 자동 전달됩니다."
          />
          <div
            className="responsive-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr',
              gap: 18,
              marginTop: 22,
            }}
          >
            {popularLoading ? (
              [0,1,2].map(i => (
                <div key={i} style={{ height: i===0?280:240, borderRadius: 16, background: COLORS.surfaceAlt, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))
            ) : popular.length === 0 ? (
              <EmptyPopular onWrite={() => navigate('/write')} />
            ) : (
              popular.slice(0, 3).map((d, i) => (
                <PopularCard
                  key={d.id}
                  d={toPopularCard(d)}
                  large={i === 0}
                  onClick={() => navigate(`/proposals/${d.id}`)}
                />
              ))
            )}
          </div>
        </section>

        {/* Selected issues */}
        <section className="responsive-section" style={{ padding: '36px 48px 80px', background: COLORS.bg }}>
          <SectionHeader
            kicker="선정된 안건"
            title="학생회로 전달된 의견"
            sub="추천 30표를 달성하여 학생회·학교에 정식 전달된 안건입니다."
            action={
              <button
                type="button"
                onClick={() => navigate('/archive')}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.ink,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  cursor: 'pointer',
                  border: 0,
                  background: 'transparent',
                  fontFamily: 'inherit',
                }}
              >
                전체 아카이브 →
              </button>
            }
          />

          {selectedLoading ? (
            <div style={{ marginTop: 20, padding: '40px 0', textAlign: 'center', color: COLORS.inkMuted, fontSize: 13 }}>
              불러오는 중…
            </div>
          ) : selected.length === 0 ? (
            <div style={{ marginTop: 20 }}><EmptySelected /></div>
          ) : (
            <div
              style={{
                marginTop: 20,
                background: COLORS.surface,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              {selected.map((s, i) => {
                const label = getProposalStatusLabel(s.status)
                const tone = getProposalStatusTone(s.status)
                return (
                  <button
                    className="selected-proposal-row"
                    type="button"
                    key={s.id}
                    onClick={() => navigate(`/proposals/${s.id}`)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr 220px 130px 80px',
                      gap: 16,
                      padding: '20px 24px',
                      alignItems: 'center',
                      borderTop: i ? `1px solid ${COLORS.lineSoft}` : 'none',
                      cursor: 'pointer',
                      width: '100%',
                      borderRight: 0,
                      borderBottom: 0,
                      borderLeft: 0,
                      background: 'transparent',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: COLORS.inkMuted,
                        fontFeatureSettings: '"tnum"',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <TagPill>{s.category}</TagPill>
                        <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                          {new Date(s.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink, letterSpacing: '-0.015em' }}>
                        {s.title}
                      </div>
                    </div>
                    <div><Badge tone={tone}>{label}</Badge></div>
                    <div style={{ fontSize: 13, color: COLORS.ink }}>
                      <strong style={{ fontWeight: 700 }}>{s.vote_count}</strong>
                      <span style={{ color: COLORS.inkMuted }}> 표 추천</span>
                    </div>
                    <span style={{ fontSize: 12, color: COLORS.inkMuted, justifySelf: 'end' }}>→</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* FAB */}
        <button
          type="button"
          aria-label="새 의견 제안하기"
          className="home-write-fab"
          onClick={() => navigate('/write')}
          style={{
            position: 'fixed',
            right: 36,
            bottom: 36,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 22px 14px 18px',
            borderRadius: 999,
            background: COLORS.ink,
            color: '#fff',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.35), 0 4px 10px -2px rgba(0,0,0,0.15)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            border: 0,
            fontFamily: 'inherit',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 4v12M4 10h12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          의견 제안하기
        </button>
      </div>
    </AppLayout>
  )
}
