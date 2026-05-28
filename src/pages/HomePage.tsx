import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import ProgressBar from '../components/shared/ProgressBar'
import { useAuth } from '../contexts/AuthContext'
import { usePopularProposals, useSelectedProposals, useHomeStats } from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import type { BadgeTone } from '../tokens/tokens'
import type { Proposal } from '../types/database'

// ── Helpers ──
function statusLabel(status: string): [string, BadgeTone] {
  if (status === 'done')     return ['반영 완료', 'brandSoft']
  if (status === 'selected') return ['학생회 전달', 'brandSoft']
  if (status === 'rejected') return ['반려', 'warn']
  return ['협의 중', 'hold']
}

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
    <span className="text-xs font-semibold px-2 py-0.75 rounded-1 bg-surface-alt text-ink-sub border border-line">
      {children}
    </span>
  )
}

function Stat({ n, l, tone, loading }: { n: string; l: string; tone?: 'brand'; loading?: boolean }) {
  return (
    <div>
      <div
        className="text-6xl font-bold leading-none"
        style={{
          letterSpacing: '-0.03em',
          color: tone === 'brand' ? COLORS.brand : COLORS.ink,
          fontFeatureSettings: '"tnum"',
          opacity: loading ? 0.4 : 1,
        }}
      >
        {loading ? '—' : n}
      </div>
      <div className="text-xs text-ink-sub mt-1.5">{l}</div>
    </div>
  )
}

function SectionHeader({
  kicker, title, sub, action,
}: { kicker: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-end">
      <div>
        <div className="text-xs font-bold text-brand mb-2.5" style={{ letterSpacing: '0.16em' }}>
          {kicker}
        </div>
        <h2 className="text-7xl font-bold m-0" style={{ letterSpacing: '-0.028em' }}>{title}</h2>
        {sub && <p className="text-sm text-ink-sub mt-2 mb-0">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

interface PopularCardData {
  cat: string; votes: number; max: number; title: string; body: string; author: string; when: string; comments: number
}

function PopularCard({ d, large = false, onClick }: { d: PopularCardData; large?: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-surface border border-line rounded-4 flex flex-col gap-3.5 relative cursor-pointer"
      style={{ padding: large ? 28 : 22, minHeight: large ? 280 : 240 }}
    >
      <div className="flex justify-between items-start">
        <TagPill>{d.cat}</TagPill>
        <Badge tone="fire">🔥 인기 급상승</Badge>
      </div>
      <h3
        className="font-bold m-0 text-ink"
        style={{
          fontSize: large ? 22 : 17, lineHeight: 1.35, letterSpacing: '-0.02em',
          display: '-webkit-box', WebkitLineClamp: large ? 3 : 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {d.title}
      </h3>
      <p
        className="text-sm text-ink-sub m-0"
        style={{
          lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: large ? 3 : 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {d.body}
      </p>
      <div className="mt-auto">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-xs text-ink-sub">선정까지</span>
          <span className="text-sm font-bold text-ink">
            {d.votes}<span className="text-ink-muted font-medium"> / {d.max}표</span>
          </span>
        </div>
        <ProgressBar value={d.votes} max={d.max} />
        <div className="flex justify-between items-center mt-3" style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
          <span>{d.author} · {d.when}</span>
          <span>💬 {d.comments}</span>
        </div>
      </div>
    </div>
  )
}

function EmptyPopular({ onWrite }: { onWrite: () => void }) {
  return (
    <div className="col-span-full py-16 text-center bg-surface border border-line rounded-4">
      <div className="text-4xl mb-3.5">📣</div>
      <div className="text-xl font-bold text-ink mb-2">아직 인기 안건이 없습니다</div>
      <div className="text-sm text-ink-sub mb-5">추천 20표 이상 안건이 생기면 여기에 표시됩니다.</div>
      <button
        onClick={onWrite}
        className="px-5 py-2.5 rounded-full text-sm font-semibold bg-ink text-white border-none cursor-pointer font-sans"
      >
        첫 번째 안건 제안하기
      </button>
    </div>
  )
}

function EmptySelected() {
  return (
    <div className="py-12 px-6 text-center bg-surface border border-line rounded-4">
      <div className="text-3xl mb-2.5">📭</div>
      <div className="text-base text-ink-sub">아직 선정된 안건이 없습니다. 30표를 모으면 자동으로 학생회로 전달됩니다.</div>
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
    author: d.is_anonymous ? `익명·${d.profiles?.grade ?? '?'}학년` : '작성자',
    when: relativeTime(d.created_at),
    comments: d.comment_count,
  })

  return (
    <AppLayout active="home" isAdmin={profile?.is_admin ?? false}>
      <div className="relative flex-1">
        {/* Hero */}
        <section className="px-4 sm:px-12 pt-8 sm:pt-12 pb-6 bg-bg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-6">
            <div>
              <div className="text-xs font-bold text-brand mb-3.5" style={{ letterSpacing: '0.18em' }}>
                VOICE OF DAESHIN — 2026 SPRING
              </div>
              <h1
                className="text-8xl sm:text-11xl font-extrabold leading-none m-0 text-ink"
                style={{ letterSpacing: '-0.035em' }}
              >
                오늘, 학교에<br />한 표를 던지세요.
              </h1>
            </div>

            {/* Stats widget */}
            <div className="flex sm:flex-shrink-0 gap-6 sm:gap-8 bg-surface border border-line rounded-3.5 px-5 py-4 sm:px-5.5 sm:py-4.5 items-center">
              <Stat n={String(stats.active)}        l="진행 중 안건"  loading={statsLoading} />
              <div className="w-px h-9 bg-line-soft" />
              <Stat n={String(stats.selected)}      l="선정된 안건"  loading={statsLoading} />
              <div className="w-px h-9 bg-line-soft" />
              <Stat n={String(stats.doneThisMonth)} l="이번 달 반영" tone="brand" loading={statsLoading} />
            </div>
          </div>
        </section>

        {/* Popular issues */}
        <section className="px-4 sm:px-12 pt-8 sm:pt-9 pb-6 bg-bg">
          <SectionHeader
            kicker="인기 이슈"
            title="곧 선정될 안건들"
            sub="추천 20표 이상 · 30표 달성 시 학생회로 자동 전달됩니다."
          />
          <div
            className="grid gap-4 sm:gap-4.5 mt-5 sm:mt-5.5"
            style={{ gridTemplateColumns: 'repeat(1, minmax(0, 1fr))' }}
          >
            {/* Mobile: single column */}
            <div className="sm:hidden grid grid-cols-1 gap-4">
              {popularLoading ? (
                [0,1,2].map(i => (
                  <div key={i} style={{ height: 200 }} className="rounded-4 bg-surface-alt animate-pulse" />
                ))
              ) : popular.length === 0 ? (
                <EmptyPopular onWrite={() => navigate('/write')} />
              ) : (
                popular.slice(0, 3).map((d) => (
                  <PopularCard
                    key={d.id}
                    d={toPopularCard(d)}
                    large={false}
                    onClick={() => navigate(`/proposals/${d.id}`)}
                  />
                ))
              )}
            </div>
            {/* Desktop: 3-col with large first card */}
            <div className="hidden sm:grid gap-4.5 mt-0" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
              {popularLoading ? (
                [0,1,2].map(i => (
                  <div key={i} style={{ height: i===0?280:240 }} className="rounded-4 bg-surface-alt animate-pulse" />
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
          </div>
        </section>

        {/* Selected issues */}
        <section className="px-4 sm:px-12 pt-8 sm:pt-9 pb-20 sm:pb-20 bg-bg">
          <SectionHeader
            kicker="선정된 안건"
            title="학생회로 전달된 의견"
            sub="추천 30표를 달성하여 학생회·학교에 정식 전달된 안건입니다."
            action={
              <span
                onClick={() => navigate('/archive')}
                className="text-sm font-semibold text-ink cursor-pointer underline underline-offset-2"
              >
                전체 아카이브 →
              </span>
            }
          />

          {selectedLoading ? (
            <div className="mt-5 py-10 text-center text-ink-muted text-sm">불러오는 중…</div>
          ) : selected.length === 0 ? (
            <div className="mt-5"><EmptySelected /></div>
          ) : (
            <div className="mt-5 bg-surface border border-line rounded-4 overflow-hidden">
              {selected.map((s, i) => {
                const [label, tone] = statusLabel(s.status)
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/proposals/${s.id}`)}
                    className="cursor-pointer px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:grid sm:items-center gap-2 sm:gap-4"
                    style={{
                      gridTemplateColumns: '60px 1fr 220px 130px 80px',
                      borderTop: i ? `1px solid ${COLORS.lineSoft}` : 'none',
                    }}
                  >
                    <div className="hidden sm:block">
                      <span
                        className="text-4xl font-bold text-ink-muted"
                        style={{ fontFeatureSettings: '"tnum"', letterSpacing: '-0.02em' }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <TagPill>{s.category}</TagPill>
                        <span className="text-xs text-ink-muted">
                          {new Date(s.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <div className="text-lg font-semibold text-ink" style={{ letterSpacing: '-0.015em' }}>
                        {s.title}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:contents">
                      <div><Badge tone={tone}>{label}</Badge></div>
                      <div className="text-sm text-ink">
                        <strong className="font-bold">{s.vote_count}</strong>
                        <span className="text-ink-muted"> 표 추천</span>
                      </div>
                      <span className="hidden sm:block text-xs text-ink-muted justify-self-end">→</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* FAB — desktop only */}
        <div
          onClick={() => navigate('/write')}
          className="hidden sm:flex fixed right-9 bottom-9 z-50 items-center gap-3 rounded-full text-white text-base font-semibold cursor-pointer"
          style={{
            background: COLORS.ink,
            padding: '14px 22px 14px 18px',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.35), 0 4px 10px -2px rgba(0,0,0,0.15)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 4v12M4 10h12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          의견 제안하기
        </div>
      </div>
    </AppLayout>
  )
}
