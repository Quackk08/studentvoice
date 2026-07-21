import { useState } from 'react'
import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import Btn from '../components/shared/Btn'
import OfficialReplyCard, { getDisplayableOfficialReply } from '../components/shared/OfficialReplyCard'
import { useAuth } from '../contexts/AuthContext'
import { useArchive } from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import { getProposalStatusLabel, getProposalStatusTone } from '../lib/proposalStatus'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

const FILTER_TABS = [
  { id: 'all',      label: '전체' },
  { id: 'done',     label: '반영 완료' },
  { id: 'wip',      label: '진행 중' },
  { id: 'hold',     label: '반려/보류' },
] as const

type FilterId = typeof FILTER_TABS[number]['id']

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

function EmptyState() {
  return (
    <div
      style={{
        padding: '80px 24px', textAlign: 'center',
        color: COLORS.inkMuted, fontSize: 14,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
      <div style={{ fontWeight: 600, marginBottom: 6, color: COLORS.inkSub }}>아직 처리된 안건이 없습니다</div>
      <div>30표가 모인 안건이 처리되면 여기에 표시됩니다.</div>
    </div>
  )
}

export default function ArchivePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<FilterId>('all')
  const [searchText, setSearchText] = useState('')

  // 전체 데이터를 한 번만 fetch → 탭 카운트·필터를 클라이언트에서 계산
  const { data: allData, loading } = useArchive('all')

  // 탭별 카운트 (항상 전체 기준)
  const tabCounts: Record<FilterId, number> = {
    all:  allData.length,
    done: allData.filter(a => a.status === 'done').length,
    wip:  allData.filter(a => a.status === 'selected' || a.status === 'discussing').length,
    hold: allData.filter(a => a.status === 'rejected').length,
  }

  // 탭 필터 적용
  const tabFiltered =
    activeTab === 'all'  ? allData :
    activeTab === 'done' ? allData.filter(a => a.status === 'done') :
    activeTab === 'wip'  ? allData.filter(a => a.status === 'selected' || a.status === 'discussing') :
                           allData.filter(a => a.status === 'rejected')

  // 검색 필터
  const data = searchText.trim()
    ? tabFiltered.filter(a =>
        a.title.toLowerCase().includes(searchText.toLowerCase()) ||
        a.category.toLowerCase().includes(searchText.toLowerCase()),
      )
    : tabFiltered

  return (
    <AppLayout active="archive" isAdmin={profile?.is_admin}>
      {/* Hero + tabs */}
      <section className="responsive-section" style={{ padding: '56px 48px 24px', background: COLORS.bg }}>
        <div
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            color: COLORS.brand, marginBottom: 14,
          }}
        >
          ARCHIVE
        </div>
        <h1
          style={{
            fontSize: 48, fontWeight: 800, margin: 0,
            letterSpacing: '-0.032em', lineHeight: 1.05,
          }}
        >
          학생회 답변과<br />학교의 응답들.
        </h1>
        <p
          style={{
            fontSize: 14, color: COLORS.inkSub, marginTop: 16,
            maxWidth: 560, lineHeight: 1.65,
          }}
        >
          30표 이상 모인 안건에 대해 학생회와 학교가 어떻게 답했는지를 확인할 수 있습니다.
        </p>

        {/* Filter tabs */}
        <div
          style={{
            marginTop: 36, display: 'flex', gap: 8,
            borderBottom: `1px solid ${COLORS.line}`,
          }}
        >
          {FILTER_TABS.map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  border: 'none', background: 'transparent', padding: '12px 18px',
                  cursor: 'pointer', fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? COLORS.ink : COLORS.inkSub,
                  borderBottom: `2px solid ${isActive ? COLORS.ink : 'transparent'}`,
                  marginBottom: -1, display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'inherit', letterSpacing: '-0.01em',
                }}
              >
                {t.label}
                <span
                  style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 99,
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

          {/* Search */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
                border: `1px solid ${COLORS.line}`, borderRadius: 8,
                background: COLORS.surface, height: 36,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="4.5" stroke={COLORS.inkSub} strokeWidth="1.4" />
                <path d="M13 13l-2.5-2.5" stroke={COLORS.inkSub} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="안건 검색"
                style={{
                  border: 'none', outline: 'none', fontSize: 12, color: COLORS.ink,
                  background: 'transparent', fontFamily: 'inherit', width: 140,
                }}
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 13, color: COLORS.inkMuted, padding: 0, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <span style={{ fontSize: 12, color: COLORS.inkSub }}>
              최신순 ↓
            </span>
          </div>
        </div>
      </section>

      {/* Archive list */}
      <section className="responsive-section" style={{ padding: '32px 48px 80px', background: COLORS.bg }}>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: COLORS.inkMuted, fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : data.length === 0 ? (
          searchText ? (
            <div style={{ padding: '80px 24px', textAlign: 'center', color: COLORS.inkMuted, fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontWeight: 600, color: COLORS.inkSub, marginBottom: 6 }}>
                '{searchText}' 검색 결과가 없습니다
              </div>
              <div style={{ fontSize: 13 }}>다른 키워드로 검색해 보세요.</div>
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.map((a) => {
              const statusLabel = getProposalStatusLabel(a.status)
              const statusTone = getProposalStatusTone(a.status)
              const reply = getDisplayableOfficialReply(a.official_replies, a.status)
              return (
                <div
                  className="responsive-grid"
                  key={a.id}
                  style={{
                    background: COLORS.surface, border: `1px solid ${COLORS.line}`,
                    borderRadius: 16, padding: '24px 28px',
                    display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32,
                  }}
                >
                  {/* Left */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <TagPill>{a.category}</TagPill>
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                      <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                        {formatDate(a.created_at)} · {a.vote_count}표
                      </span>
                    </div>
                    <h3
                      style={{
                        fontSize: 19, fontWeight: 700, margin: 0,
                        letterSpacing: '-0.02em', lineHeight: 1.35,
                      }}
                    >
                      {a.title}
                    </h3>

                    {/* Official reply */}
                    {reply ? (
                      <div style={{ marginTop: 16 }}>
                        <OfficialReplyCard reply={reply} compact />
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 16, padding: '12px 16px',
                          background: COLORS.surfaceAlt, borderRadius: 10,
                          borderLeft: `3px solid ${COLORS.line}`,
                        }}
                      >
                        <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
                          아직 공식 답변이 작성되지 않았습니다.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right */}
                  <div
                    style={{
                      display: 'flex', flexDirection: 'column',
                      justifyContent: 'space-between', alignItems: 'flex-end', gap: 12,
                    }}
                  >
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: COLORS.inkMuted, letterSpacing: '0.08em' }}>
                        VOTES
                      </div>
                      <div
                        style={{
                          fontSize: 36, fontWeight: 800, color: COLORS.ink,
                          letterSpacing: '-0.03em', lineHeight: 1,
                          fontFeatureSettings: '"tnum"',
                        }}
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
