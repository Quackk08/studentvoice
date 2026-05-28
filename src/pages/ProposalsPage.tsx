import { useState } from 'react'
import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import ProgressBar from '../components/shared/ProgressBar'
import { useAuth } from '../contexts/AuthContext'
import { useAllProposals } from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import type { ProposalSort } from '../hooks/useProposals'
import type { Proposal } from '../types/database'

// ── 카테고리 필터 ─────────────────────────────────────────
const CATEGORY_TABS = [
  { id: 'all',  label: '전체' },
  { id: '#시설', label: '시설' },
  { id: '#급식', label: '급식' },
  { id: '#교칙', label: '교칙' },
  { id: '#학사', label: '학사' },
  { id: '#수업', label: '수업' },
  { id: '#복지', label: '복지' },
  { id: '#기타', label: '기타' },
] as const

const SORT_OPTIONS: { id: ProposalSort; label: string }[] = [
  { id: 'votes',    label: '추천순' },
  { id: 'date',     label: '최신순' },
  { id: 'comments', label: '댓글순' },
]

// ── Helpers ──────────────────────────────────────────────
function relativeTime(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60)      return '방금 전'
  if (diff < 3600)    return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400)   return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400*7) return `${Math.floor(diff / 86400)}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

// ── Sub-components ────────────────────────────────────────
function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.75 rounded-1 bg-surface-alt text-ink-sub border border-line flex-shrink-0">
      {children}
    </span>
  )
}

function ProposalCard({ p, onClick }: { p: Proposal; onClick: () => void }) {
  const isHot = p.vote_count >= 20
  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-4 cursor-pointer flex flex-col gap-3 min-w-0 overflow-hidden"
      style={{
        border: `1px solid ${isHot ? COLORS.brand : COLORS.line}`,
        padding: '22px 24px',
        boxShadow: isHot ? `0 0 0 1px ${COLORS.brand}10` : 'none',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 min-w-0">
        <TagPill>{p.category}</TagPill>
        {isHot && <Badge tone="fire">🔥 인기</Badge>}
        <span className="ml-auto text-xs text-ink-muted flex-shrink-0">{relativeTime(p.created_at)}</span>
      </div>

      {/* Title */}
      <h3
        className="text-xl font-bold m-0 text-ink"
        style={{
          lineHeight: 1.4, letterSpacing: '-0.02em',
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          wordBreak: 'break-word', overflowWrap: 'break-word',
        }}
      >
        {p.title}
      </h3>

      {/* Body preview */}
      <p
        className="text-sm text-ink-sub m-0"
        style={{
          lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          wordBreak: 'break-word', overflowWrap: 'break-word',
        }}
      >
        {p.body}
      </p>

      {/* Vote progress */}
      <div className="mt-auto">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-xs text-ink-sub">선정까지</span>
          <span
            className="text-xs font-bold"
            style={{ color: isHot ? COLORS.brand : COLORS.ink, fontFeatureSettings: '"tnum"' }}
          >
            {p.vote_count}
            <span className="text-ink-muted font-medium"> / 30표</span>
          </span>
        </div>
        <ProgressBar value={p.vote_count} max={30} height={6} />
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-3 pt-2.5 border-t border-line-soft"
        style={{ fontSize: 11.5, color: COLORS.inkMuted }}
      >
        <span>
          {p.is_anonymous
            ? `익명 · ${p.profiles?.grade ?? '?'}학년`
            : `${p.profiles?.grade ?? '?'}학년`}
        </span>
        <span className="ml-auto">💬 {p.comment_count}</span>
        <span>👁 {p.view_count}</span>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-surface border border-line rounded-4 opacity-50 animate-pulse" style={{ height: 240 }} />
  )
}

function EmptyState({ category }: { category: string }) {
  return (
    <div className="col-span-full py-20 text-center text-ink-muted">
      <div className="text-5xl mb-4">📭</div>
      <div className="text-xl font-bold text-ink-sub mb-2">
        {category === 'all' ? '진행 중인 안건이 없습니다' : `${category} 카테고리에 안건이 없습니다`}
      </div>
      <div className="text-sm mx-auto max-w-xs" style={{ lineHeight: 1.65 }}>
        첫 번째 안건을 제안해 30표를 모아보세요!
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────
export default function ProposalsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [activeSort, setActiveSort] = useState<ProposalSort>('votes')
  const [search, setSearch] = useState('')

  const { data: rawData, loading } = useAllProposals(activeCategory, activeSort)

  const data: Proposal[] = search.trim()
    ? rawData.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.body.toLowerCase().includes(search.toLowerCase()),
      )
    : rawData

  return (
    <AppLayout active="proposals" isAdmin={profile?.is_admin ?? false}>
      {/* ── Hero ── */}
      <section className="px-4 sm:px-12 pt-8 sm:pt-12 pb-0 bg-bg">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-xs font-bold text-brand mb-3.5" style={{ letterSpacing: '0.18em' }}>
            ALL PROPOSALS
          </div>
          <div className="flex items-end gap-6">
            <h1 className="text-9xl sm:text-10xl font-extrabold m-0" style={{ letterSpacing: '-0.032em', lineHeight: 1.05 }}>
              진행 중인 안건
            </h1>
            {!loading && (
              <span className="text-xl text-ink-muted font-medium mb-1.5" style={{ letterSpacing: '-0.01em' }}>
                총 {rawData.length}건
              </span>
            )}
          </div>
          <p className="text-base text-ink-sub mt-3 max-w-[560px]" style={{ lineHeight: 1.65 }}>
            추천 30표를 달성하면 학생회로 자동 전달됩니다. 공감하는 안건에 추천을 눌러주세요.
          </p>
        </div>
      </section>

      {/* ── Filter / Search bar ── */}
      <section
        className="px-4 sm:px-12 pt-6 pb-0 bg-bg sticky top-0 z-10 border-b border-line"
      >
        <div className="max-w-[1200px] mx-auto">
          {/* Category tabs — scrollable on mobile */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0 scrollbar-hide">
            <div className="flex gap-0.5 flex-1 min-w-0 overflow-x-auto">
              {CATEGORY_TABS.map(t => {
                const isActive = activeCategory === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => { setActiveCategory(t.id); setSearch('') }}
                    className="flex-shrink-0 px-3 sm:px-4 py-2.5 border-none bg-transparent font-sans cursor-pointer -mb-px"
                    style={{
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      color: isActive ? COLORS.ink : COLORS.inkSub,
                      borderBottom: `2px solid ${isActive ? COLORS.ink : 'transparent'}`,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* Sort + Search — desktop */}
            <div className="hidden sm:flex items-center gap-1 pb-1 flex-shrink-0">
              {SORT_OPTIONS.map(s => {
                const isActive = activeSort === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSort(s.id)}
                    className="px-3 py-1.5 rounded-2 text-xs font-semibold cursor-pointer font-sans"
                    style={{
                      background: isActive ? COLORS.ink : COLORS.surface,
                      color: isActive ? '#fff' : COLORS.inkSub,
                      border: `1px solid ${isActive ? COLORS.ink : COLORS.line}`,
                    }}
                  >
                    {s.label}
                  </button>
                )
              })}
              <div className="flex items-center gap-2 ml-1 border border-line rounded-2 bg-surface h-8 px-3">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <circle cx="7" cy="7" r="4.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
                  <path d="M13 13l-2.5-2.5" stroke={COLORS.inkSub} strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="안건 검색"
                  className="border-none outline-none text-xs text-ink bg-transparent font-sans w-32"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="border-none bg-none cursor-pointer text-sm text-ink-muted p-0 leading-none">✕</button>
                )}
              </div>
            </div>
          </div>

          {/* Mobile: sort row */}
          <div className="flex sm:hidden items-center gap-1.5 py-2 overflow-x-auto">
            {SORT_OPTIONS.map(s => {
              const isActive = activeSort === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSort(s.id)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-2 text-xs font-semibold cursor-pointer font-sans"
                  style={{
                    background: isActive ? COLORS.ink : COLORS.surface,
                    color: isActive ? '#fff' : COLORS.inkSub,
                    border: `1px solid ${isActive ? COLORS.ink : COLORS.line}`,
                  }}
                >
                  {s.label}
                </button>
              )
            })}
            <div className="flex-1" />
            <div className="flex items-center gap-2 border border-line rounded-2 bg-surface h-8 px-3 flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
                <path d="M13 13l-2.5-2.5" stroke={COLORS.inkSub} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="검색"
                className="border-none outline-none text-xs text-ink bg-transparent font-sans w-20"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Proposal grid ── */}
      <section className="px-4 sm:px-12 py-7 sm:pb-20 bg-bg">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-4.5">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : data.length === 0 ? (
              <EmptyState category={search ? '검색' : activeCategory} />
            ) : (
              data.map(p => (
                <ProposalCard
                  key={p.id}
                  p={p}
                  onClick={() => navigate(`/proposals/${p.id}`)}
                />
              ))
            )}
          </div>

          {!loading && search && data.length === 0 && (
            <div className="text-center mt-10 text-ink-muted text-sm">
              '{search}'에 대한 결과가 없습니다.{' '}
              <button
                onClick={() => setSearch('')}
                className="bg-none border-none text-brand cursor-pointer font-sans text-sm font-semibold"
              >
                검색 초기화
              </button>
            </div>
          )}
        </div>
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
    </AppLayout>
  )
}
