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
    <span
      style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
        background: COLORS.surfaceAlt, color: COLORS.inkSub, border: `1px solid ${COLORS.line}`,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  )
}

function ProposalCard({ p, onClick }: { p: Proposal; onClick: () => void }) {
  const isHot = p.vote_count >= 20
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: COLORS.surface,
        border: `1px solid ${isHot ? COLORS.brand : COLORS.line}`,
        borderRadius: 16,
        padding: '22px 24px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'border-color .15s, box-shadow .15s',
        boxShadow: isHot ? `0 0 0 1px ${COLORS.brand}10` : 'none',
        /* Grid 아이템이 컨텐츠 크기 이하로 줄어들 수 있게 */
        minWidth: 0,
        overflow: 'hidden',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <TagPill>{p.category}</TagPill>
        {isHot && <Badge tone="fire">🔥 인기</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.inkMuted, flexShrink: 0 }}>
          {relativeTime(p.created_at)}
        </span>
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 16, fontWeight: 700, margin: 0,
          lineHeight: 1.4, letterSpacing: '-0.02em', color: COLORS.ink,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          wordBreak: 'break-word', overflowWrap: 'break-word',
        }}
      >
        {p.title}
      </h3>

      {/* Body preview */}
      <p
        style={{
          fontSize: 13, color: COLORS.inkSub, margin: 0, lineHeight: 1.65,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          wordBreak: 'break-word', overflowWrap: 'break-word',
        }}
      >
        {p.body}
      </p>

      {/* Vote progress */}
      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 11, color: COLORS.inkSub }}>선정까지</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isHot ? COLORS.brand : COLORS.ink, fontFeatureSettings: '"tnum"' }}>
            {p.vote_count}
            <span style={{ color: COLORS.inkMuted, fontWeight: 500 }}> / 30표</span>
          </span>
        </div>
        <ProgressBar value={p.vote_count} max={30} height={6} />
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 11.5, color: COLORS.inkMuted,
          paddingTop: 10, borderTop: `1px solid ${COLORS.lineSoft}`,
        }}
      >
        <span>
          {p.is_anonymous
            ? `익명 · ${p.author_grade ?? '?'}학년`
            : (p.author_name ?? `${p.author_grade ?? '?'}학년 학생`)}
        </span>
        <span style={{ marginLeft: 'auto' }}>💬 {p.comment_count}</span>
        <span>👁 {p.view_count}</span>
      </div>
    </button>
  )
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: COLORS.surface, border: `1px solid ${COLORS.line}`,
        borderRadius: 16, padding: '22px 24px', height: 240,
        opacity: 0.5,
      }}
    />
  )
}

function EmptyState({ category }: { category: string }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1', padding: '80px 0',
        textAlign: 'center', color: COLORS.inkMuted,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.inkSub, marginBottom: 8 }}>
        {category === 'all' ? '진행 중인 안건이 없습니다' : `${category} 카테고리에 안건이 없습니다`}
      </div>
      <div style={{ fontSize: 13, maxWidth: 320, margin: '0 auto', lineHeight: 1.65 }}>
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

  // 클라이언트 사이드 검색 필터
  const data: Proposal[] = search.trim()
    ? rawData.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.body.toLowerCase().includes(search.toLowerCase()),
      )
    : rawData

  return (
    <AppLayout active="proposals" isAdmin={profile?.is_admin ?? false}>
      {/* ── Hero ── */}
      <section className="responsive-section" style={{ padding: '48px 48px 0', background: COLORS.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              color: COLORS.brand, marginBottom: 14,
            }}
          >
            ALL PROPOSALS
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
            <h1
              style={{
                fontSize: 44, fontWeight: 800, margin: 0,
                letterSpacing: '-0.032em', lineHeight: 1.05,
              }}
            >
              진행 중인 안건
            </h1>
            {!loading && (
              <span
                style={{
                  fontSize: 16, color: COLORS.inkMuted, fontWeight: 500,
                  marginBottom: 6, letterSpacing: '-0.01em',
                }}
              >
                총 {rawData.length}건
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 14, color: COLORS.inkSub, marginTop: 12,
              maxWidth: 560, lineHeight: 1.65,
            }}
          >
            추천 30표를 달성하면 학생회로 자동 전달됩니다. 공감하는 안건에 추천을 눌러주세요.
          </p>
        </div>
      </section>

      {/* ── Filter / Search bar ── */}
      <section
        className="responsive-section"
        style={{
          padding: '24px 48px 0',
          background: COLORS.bg,
          position: 'sticky', top: 0, zIndex: 10,
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 0 }}>
            {/* Category tabs */}
            <div className="filter-tabs" style={{ display: 'flex', gap: 2, flex: 1 }}>
              {CATEGORY_TABS.map(t => {
                const isActive = activeCategory === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => { setActiveCategory(t.id); setSearch('') }}
                    style={{
                      padding: '10px 16px', border: 'none', background: 'transparent',
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      color: isActive ? COLORS.ink : COLORS.inkSub,
                      borderBottom: `2px solid ${isActive ? COLORS.ink : 'transparent'}`,
                      cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em',
                      marginBottom: -1,
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* Sort */}
            <div style={{ display: 'flex', gap: 4, paddingBottom: 1 }}>
              {SORT_OPTIONS.map(s => {
                const isActive = activeSort === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSort(s.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: isActive ? COLORS.ink : COLORS.surface,
                      color: isActive ? '#fff' : COLORS.inkSub,
                      border: `1px solid ${isActive ? COLORS.ink : COLORS.line}`,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>

            {/* Search */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 1,
                border: `1px solid ${COLORS.line}`, borderRadius: 8,
                background: COLORS.surface, height: 34, padding: '0 12px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="4.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
                <path d="M13 13l-2.5-2.5" stroke={COLORS.inkSub} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="안건 검색"
                style={{
                  border: 'none', outline: 'none', fontSize: 12, color: COLORS.ink,
                  background: 'transparent', fontFamily: 'inherit', width: 130,
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: COLORS.inkMuted, padding: 0, lineHeight: 1 }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Proposal grid ── */}
      <section className="responsive-section" style={{ padding: '28px 48px 80px', background: COLORS.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div
            className="proposal-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 18,
            }}
          >
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

          {/* 검색 결과 없음 메시지 */}
          {!loading && search && data.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40, color: COLORS.inkMuted, fontSize: 13 }}>
              '{search}'에 대한 결과가 없습니다.{' '}
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: COLORS.brand, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
              >
                검색 초기화
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FAB */}
      <button
        type="button"
        aria-label="새 안건 제안하기"
        onClick={() => navigate('/write')}
        style={{
          position: 'fixed', right: 36, bottom: 36, zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 22px 14px 18px', borderRadius: 999,
          background: COLORS.ink, color: '#fff',
          border: 'none', fontFamily: 'inherit',
          boxShadow: '0 12px 32px -8px rgba(0,0,0,0.35), 0 4px 10px -2px rgba(0,0,0,0.15)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12M4 10h12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        의견 제안하기
      </button>
    </AppLayout>
  )
}
