import { useState } from 'react'
import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import Btn from '../components/shared/Btn'
import { useArchive } from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import type { BadgeTone } from '../tokens/tokens'
import type { Proposal } from '../types/database'

// ── Helpers ──
function statusInfo(p: Proposal): [string, BadgeTone] {
  if (p.status === 'done')     return ['반영 완료', 'brandSoft']
  if (p.status === 'selected') return ['협의 진행 중', 'hold']
  if (p.status === 'rejected') return ['반려', 'warn']
  return ['처리 중', 'default']
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

const FILTER_TABS = [
  { id: 'all',  label: '전체' },
  { id: 'done', label: '반영 완료' },
  { id: 'wip',  label: '진행 중' },
  { id: 'hold', label: '반려/보류' },
] as const

type FilterId = typeof FILTER_TABS[number]['id']

function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.75 rounded-1 bg-surface-alt text-ink-sub border border-line">
      {children}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="py-20 px-6 text-center text-ink-muted text-base">
      <div className="text-4xl mb-3">📭</div>
      <div className="font-semibold mb-1.5 text-ink-sub">아직 처리된 안건이 없습니다</div>
      <div>30표가 모인 안건이 처리되면 여기에 표시됩니다.</div>
    </div>
  )
}

export default function ArchivePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<FilterId>('all')
  const [searchText, setSearchText] = useState('')

  const { data: allData, loading } = useArchive('all')

  const tabCounts: Record<FilterId, number> = {
    all:  allData.length,
    done: allData.filter(a => a.status === 'done').length,
    wip:  allData.filter(a => a.status === 'selected').length,
    hold: allData.filter(a => a.status === 'rejected').length,
  }

  const tabFiltered =
    activeTab === 'all'  ? allData :
    activeTab === 'done' ? allData.filter(a => a.status === 'done') :
    activeTab === 'wip'  ? allData.filter(a => a.status === 'selected') :
                           allData.filter(a => a.status === 'rejected')

  const data = searchText.trim()
    ? tabFiltered.filter(a =>
        a.title.toLowerCase().includes(searchText.toLowerCase()) ||
        a.category.toLowerCase().includes(searchText.toLowerCase()),
      )
    : tabFiltered

  return (
    <AppLayout active="archive">
      {/* Hero + tabs */}
      <section className="px-4 lg:px-12 pt-10 lg:pt-14 pb-6 bg-bg">
        <div className="text-xs font-bold text-brand mb-3.5" style={{ letterSpacing: '0.18em' }}>
          ARCHIVE
        </div>
        <h1 className="text-9xl sm:text-10xl font-extrabold m-0" style={{ letterSpacing: '-0.032em', lineHeight: 1.05 }}>
          학생회 답변과<br />학교의 응답들.
        </h1>
        <p className="text-base text-ink-sub mt-4 max-w-[560px]" style={{ lineHeight: 1.65 }}>
          30표 이상 모인 안건에 대해 학생회와 학교가 어떻게 답했는지를 확인할 수 있습니다.
        </p>

        {/* Filter tabs + search */}
        <div className="mt-9 border-b border-line">
          <div className="flex items-end gap-0 overflow-x-auto">
            {FILTER_TABS.map((t) => {
              const isActive = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="flex-shrink-0 border-none bg-transparent px-3 sm:px-4.5 py-3 cursor-pointer font-sans flex items-center gap-2 -mb-px"
                  style={{
                    fontSize: 14, fontWeight: isActive ? 700 : 500,
                    color: isActive ? COLORS.ink : COLORS.inkSub,
                    borderBottom: `2px solid ${isActive ? COLORS.ink : 'transparent'}`,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t.label}
                  <span
                    className="text-xs px-1.75 py-0.5 rounded-full"
                    style={{
                      background: isActive ? COLORS.ink : COLORS.surfaceAlt,
                      color: isActive ? '#fff' : COLORS.inkMuted,
                      border: isActive ? 'none' : `1px solid ${COLORS.line}`,
                    }}
                  >
                    {loading ? '…' : tabCounts[t.id]}
                  </span>
                </button>
              )
            })}

            {/* Search — hidden on mobile, shown on sm+ */}
            <div className="hidden lg:flex ml-auto items-center gap-3 pb-1">
              <div className="flex items-center gap-2 px-3 border border-line rounded-2 bg-surface h-9">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                  <circle cx="7" cy="7" r="4.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
                  <path d="M13 13l-2.5-2.5" stroke={COLORS.inkSub} strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="안건 검색"
                  className="border-none outline-none text-xs text-ink bg-transparent font-sans w-36"
                />
                {searchText && (
                  <button onClick={() => setSearchText('')} className="border-none bg-none cursor-pointer text-sm text-ink-muted p-0 leading-none">✕</button>
                )}
              </div>
              <span className="text-xs text-ink-sub">최신순 ↓</span>
            </div>
          </div>

          {/* Mobile search row */}
          <div className="flex lg:hidden items-center gap-2 py-2">
            <div className="flex-1 flex items-center gap-2 px-3 border border-line rounded-2 bg-surface h-9">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
                <path d="M13 13l-2.5-2.5" stroke={COLORS.inkSub} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="안건 검색"
                className="flex-1 border-none outline-none text-xs text-ink bg-transparent font-sans"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Archive list */}
      <section className="px-4 lg:px-12 pt-8 pb-20 bg-bg">
        {loading ? (
          <div className="py-15 text-center text-ink-muted text-sm">불러오는 중…</div>
        ) : data.length === 0 ? (
          searchText ? (
            <div className="py-20 px-6 text-center text-ink-muted text-base">
              <div className="text-4xl mb-3">🔍</div>
              <div className="font-semibold text-ink-sub mb-1.5">'{searchText}' 검색 결과가 없습니다</div>
              <div className="text-sm">다른 키워드로 검색해 보세요.</div>
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="flex flex-col gap-3.5">
            {data.map((a) => {
              const [statusLabel, statusTone] = statusInfo(a)
              const reply = a.official_replies?.[0]
              return (
                <div
                  key={a.id}
                  className="bg-surface border border-line rounded-4 p-6 sm:p-7 flex flex-col lg:grid lg:gap-8"
                  style={{ gridTemplateColumns: '1fr 280px' }}
                >
                  {/* Left */}
                  <div>
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <TagPill>{a.category}</TagPill>
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                      <span className="text-xs text-ink-muted">
                        {formatDate(a.created_at)} · {a.vote_count}표
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold m-0" style={{ letterSpacing: '-0.02em', lineHeight: 1.35 }}>
                      {a.title}
                    </h3>

                    {reply ? (
                      <div
                        className="mt-4 px-4 py-3.5 bg-surface-alt rounded-2.5"
                        style={{ borderLeft: `3px solid ${COLORS.brand}` }}
                      >
                        <div className="text-2xs font-bold text-brand mb-1.5" style={{ letterSpacing: '0.14em' }}>
                          OFFICIAL REPLY
                        </div>
                        <p className="text-sm text-ink m-0" style={{ lineHeight: 1.65 }}>{reply.content}</p>
                        <div className="text-xs text-ink-muted mt-2.5">— {reply.signed_by}</div>
                      </div>
                    ) : (
                      <div
                        className="mt-4 px-4 py-3 bg-surface-alt rounded-2.5"
                        style={{ borderLeft: `3px solid ${COLORS.line}` }}
                      >
                        <span className="text-xs text-ink-muted">아직 공식 답변이 작성되지 않았습니다.</span>
                      </div>
                    )}
                  </div>

                  {/* Right */}
                  <div className="flex lg:flex-col lg:justify-between lg:items-end gap-3 mt-4 lg:mt-0 items-center">
                    <div className="lg:text-right">
                      <div className="text-xs text-ink-muted" style={{ letterSpacing: '0.08em' }}>VOTES</div>
                      <div
                        className="text-8xl font-extrabold text-ink"
                        style={{ letterSpacing: '-0.03em', lineHeight: 1, fontFeatureSettings: '"tnum"' }}
                      >
                        {a.vote_count}
                      </div>
                    </div>
                    <Btn variant="outline" size="sm" onClick={() => navigate(`/proposals/${a.id}`)}>
                      상세 보기 →
                    </Btn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </AppLayout>
  )
}
