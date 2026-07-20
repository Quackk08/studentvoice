import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import Btn from '../components/shared/Btn'
import ProgressBar from '../components/shared/ProgressBar'
import { useAuth } from '../contexts/AuthContext'
import {
  moderateAdminProposal,
  resolveAdminReports,
  saveAdminOfficialReply,
  transitionAdminProposal,
  useAdminConsole,
} from '../hooks/useAdminConsole'
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONES } from '../lib/proposalStatus'
import type {
  AdminActivityItem,
  AdminModerationAction,
  AdminProposal,
  AdminProposalScope,
  AdminReportItem,
  ProposalCategory,
  ProposalStatus,
} from '../types/database'

type AdminSection = 'overview' | 'proposals' | 'reports' | 'activity'
type ProposalSort = 'updated' | 'votes' | 'reports' | 'oldest'
type ConfirmAction = AdminModerationAction | 'resolve_reports'

const ADMIN_SECTIONS: { id: AdminSection; label: string; description: string }[] = [
  { id: 'overview', label: '운영 현황', description: '오늘 처리할 업무' },
  { id: 'proposals', label: '안건 관리', description: '상태·답변 관리' },
  { id: 'reports', label: '신고 관리', description: '블라인드·해제' },
  { id: 'activity', label: '운영 기록', description: '감사 로그' },
]

const SCOPE_TABS: { id: AdminProposalScope; label: string }[] = [
  { id: 'all', label: '전체 공개' },
  { id: 'near', label: '선정 임박' },
  { id: 'open', label: '처리 중' },
  { id: 'completed', label: '완료·반려' },
  { id: 'blinded', label: '블라인드' },
  { id: 'trashed', label: '휴지통' },
]

const CATEGORIES: ProposalCategory[] = ['#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타']
const STATUS_OPTIONS: Exclude<ProposalStatus, 'blinded'>[] = ['active', 'selected', 'discussing', 'done', 'rejected']

const ACTION_LABELS: Record<ConfirmAction, string> = {
  blind: '블라인드 처리',
  unblind: '블라인드 해제',
  trash: '휴지통 이동',
  restore: '게시물 복구',
  delete: '영구 삭제',
  resolve_reports: '신고 해제',
}

const ACTIVITY_LABELS: Record<string, string> = {
  status_changed: '상태 변경',
  proposal_auto_selected: '30표 자동 선정',
  proposal_blind: '블라인드 처리',
  proposal_unblind: '블라인드 해제',
  proposal_trash: '휴지통 이동',
  proposal_restore: '게시물 복구',
  proposal_deleted: '게시물 영구 삭제',
  reports_resolved: '신고 해제',
  reports_dismissed: '신고 해제',
  official_reply_saved: '공식 답변 저장',
}

function formatDate(value: string | null | undefined, includeTime = true) {
  if (!value) return '기록 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '기록 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

function relativeTime(value: string | null | undefined) {
  if (!value) return '기록 없음'
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diff / 60_000))
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function moderationLabel(proposal: AdminProposal) {
  if (proposal.moderation_status === 'trashed') return '휴지통'
  if (proposal.moderation_status === 'blinded' || proposal.status === 'blinded') return '블라인드'
  return null
}

function StatusBadge({ proposal }: { proposal: AdminProposal }) {
  const moderation = moderationLabel(proposal)
  if (moderation) return <Badge tone={proposal.moderation_status === 'trashed' ? 'warn' : 'default'}>{moderation}</Badge>
  return <Badge tone={PROPOSAL_STATUS_TONES[proposal.status]}>{PROPOSAL_STATUS_LABELS[proposal.status]}</Badge>
}

function KpiCard({
  label,
  value,
  detail,
  tone = 'default',
  onClick,
}: {
  label: string
  value: number
  detail: string
  tone?: 'default' | 'brand' | 'warn' | 'hold'
  onClick?: () => void
}) {
  return (
    <button type="button" className={`admin-kpi admin-kpi-${tone}`} onClick={onClick}>
      <span className="admin-kpi-label">{label}</span>
      <strong>{value.toLocaleString('ko-KR')}</strong>
      <span className="admin-kpi-detail">{detail}</span>
    </button>
  )
}

function activityDescription(item: AdminActivityItem) {
  const from = typeof item.details.from === 'string' ? PROPOSAL_STATUS_LABELS[item.details.from as ProposalStatus] ?? item.details.from : null
  const to = typeof item.details.to === 'string' ? PROPOSAL_STATUS_LABELS[item.details.to as ProposalStatus] ?? item.details.to : null
  const reason = typeof item.details.reason === 'string' ? item.details.reason : null
  const publicMessage = typeof item.details.public_message === 'string' ? item.details.public_message : null
  const count = typeof item.details.count === 'number' ? item.details.count : null
  if (from && to) return `${from} → ${to}${publicMessage ? ` · ${publicMessage}` : ''}`
  if (reason) return reason
  if (count != null) return `신고 ${count}건 처리`
  if (item.action === 'official_reply_saved' && typeof item.details.signed_by === 'string') return `서명: ${item.details.signed_by}`
  return '처리 세부 정보 없음'
}

function scopeMatches(proposal: AdminProposal, scope: AdminProposalScope) {
  if (scope === 'near') return proposal.status === 'active' && proposal.moderation_status === 'visible' && proposal.vote_count >= 20 && proposal.vote_count < 30
  if (scope === 'open') return (proposal.status === 'selected' || proposal.status === 'discussing') && proposal.moderation_status === 'visible'
  if (scope === 'completed') return (proposal.status === 'done' || proposal.status === 'rejected') && proposal.moderation_status === 'visible'
  if (scope === 'blinded') return proposal.moderation_status === 'blinded' || (proposal.status === 'blinded' && proposal.moderation_status !== 'trashed')
  if (scope === 'trashed') return proposal.moderation_status === 'trashed'
  return proposal.moderation_status === 'visible' && proposal.status !== 'blinded'
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const {
    stats,
    proposals,
    reports,
    activity,
    activityAvailable,
    loading,
    error,
    refreshedAt,
    refetch,
  } = useAdminConsole()
  const isAdminConsoleV2 = stats.schemaVersion === 'admin-console-v2'

  const requestedSection = searchParams.get('view')
  const section: AdminSection = ADMIN_SECTIONS.some(item => item.id === requestedSection)
    ? requestedSection as AdminSection
    : 'overview'
  const [scope, setScope] = useState<AdminProposalScope>('all')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | ProposalCategory>('all')
  const [sort, setSort] = useState<ProposalSort>('updated')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusDraft, setStatusDraft] = useState<Exclude<ProposalStatus, 'blinded'>>('selected')
  const [publicMessage, setPublicMessage] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [replySignedBy, setReplySignedBy] = useState('학생회')
  const [confirmAction, setConfirmAction] = useState<{ action: ConfirmAction; proposal: AdminProposal } | null>(null)
  const [confirmReason, setConfirmReason] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const selectedProposal = useMemo(() => {
    if (!selectedId) return null
    return proposals.find(item => item.id === selectedId)
      ?? reports.find(item => item.proposal.id === selectedId)?.proposal
      ?? null
  }, [proposals, reports, selectedId])

  useEffect(() => {
    if (!selectedProposal) return
    const current = selectedProposal.status === 'blinded' ? 'active' : selectedProposal.status
    setStatusDraft(current)
    setPublicMessage(selectedProposal.latest_public_message ?? '')
    setInternalNote(selectedProposal.latest_internal_note ?? '')
    setReplyContent(selectedProposal.official_reply_content ?? '')
    setReplySignedBy(selectedProposal.official_reply_signed_by ?? '학생회')
  }, [selectedProposal?.id])

  const filteredProposals = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = proposals.filter(proposal => {
      if (!scopeMatches(proposal, scope)) return false
      if (category !== 'all' && proposal.category !== category) return false
      if (!needle) return true
      return [proposal.title, proposal.body, proposal.author_name, proposal.author_email]
        .some(value => value?.toLowerCase().includes(needle))
    })

    return [...list].sort((a, b) => {
      if (sort === 'votes') return b.vote_count - a.vote_count
      if (sort === 'reports') return b.report_count - a.report_count
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [category, proposals, scope, search, sort])

  const priorityItems = useMemo(() => {
    const reportItems = reports.map(item => ({
      key: `report-${item.proposal.id}`,
      proposal: item.proposal,
      label: `신고 ${item.reportCount}건`,
      detail: '신고 내용 확인 필요',
      tone: 'warn' as const,
      section: 'reports' as AdminSection,
    }))
    const openItems = proposals
      .filter(item => (item.status === 'selected' || item.status === 'discussing') && item.moderation_status === 'visible')
      .map(item => ({
        key: `open-${item.id}`,
        proposal: item,
        label: item.status === 'selected' ? '학생회 전달' : '협의 중',
        detail: `${item.vote_count}표 · ${relativeTime(item.updated_at)} 갱신`,
        tone: 'hold' as const,
        section: 'proposals' as AdminSection,
      }))
    const nearItems = proposals
      .filter(item => scopeMatches(item, 'near'))
      .sort((a, b) => b.vote_count - a.vote_count)
      .map(item => ({
        key: `near-${item.id}`,
        proposal: item,
        label: `선정까지 ${30 - item.vote_count}표`,
        detail: `${item.vote_count}표 · 학생 관심 안건`,
        tone: 'brand' as const,
        section: 'proposals' as AdminSection,
      }))
    return [...reportItems, ...openItems, ...nearItems].slice(0, 8)
  }, [proposals, reports])

  const setSection = (next: AdminSection) => {
    setSearchParams(next === 'overview' ? {} : { view: next })
    if (next === 'reports') setSelectedId(null)
  }

  const openProposal = (proposal: AdminProposal) => setSelectedId(proposal.id)

  const handleStatusSave = async () => {
    if (!selectedProposal) return
    if (isAdminConsoleV2 && (statusDraft === 'done' || statusDraft === 'rejected') && publicMessage.trim().length < 3) {
      setActionMessage({ tone: 'error', text: '반영 완료 또는 반려 처리에는 학생에게 공개할 내용을 3자 이상 입력해주세요.' })
      return
    }
    setBusyAction(`${selectedProposal.id}:status`)
    setActionMessage(null)
    const result = await transitionAdminProposal({
      proposalId: selectedProposal.id,
      newStatus: statusDraft,
      publicMessage,
      internalNote,
    })
    setBusyAction(null)
    if (result.error) {
      setActionMessage({ tone: 'error', text: `상태를 변경하지 못했습니다: ${result.error}` })
      return
    }
    setActionMessage({
      tone: 'success',
      text: isAdminConsoleV2
        ? '안건 상태와 처리 기록을 저장했습니다.'
        : '안건 상태를 변경했습니다. DB v2 적용 후 공개 안내와 내부 메모도 함께 기록됩니다.',
    })
    await refetch()
  }

  const handleReplySave = async () => {
    if (!selectedProposal) return
    if (replyContent.trim().length < 3 || replySignedBy.trim().length < 2) {
      setActionMessage({ tone: 'error', text: '공식 답변 내용과 서명자를 확인해주세요.' })
      return
    }
    setBusyAction(`${selectedProposal.id}:reply`)
    setActionMessage(null)
    const result = await saveAdminOfficialReply(selectedProposal.id, replyContent, replySignedBy)
    setBusyAction(null)
    if (result.error) {
      setActionMessage({ tone: 'error', text: `공식 답변을 저장하지 못했습니다: ${result.error}` })
      return
    }
    setActionMessage({ tone: 'success', text: '학생회 공식 답변을 저장했습니다.' })
    await refetch()
  }

  const handleConfirmedAction = async () => {
    if (!confirmAction) return
    if (confirmReason.trim().length < 3) {
      setActionMessage({ tone: 'error', text: '처리 사유를 3자 이상 입력해주세요.' })
      return
    }
    const { action, proposal } = confirmAction
    setBusyAction(`${proposal.id}:${action}`)
    setActionMessage(null)
    const result = action === 'resolve_reports'
      ? await resolveAdminReports(proposal.id, confirmReason)
      : await moderateAdminProposal({ proposalId: proposal.id, action, reason: confirmReason })
    setBusyAction(null)
    if (result.error) {
      setActionMessage({ tone: 'error', text: `${ACTION_LABELS[action]}에 실패했습니다: ${result.error}` })
      return
    }
    setActionMessage({ tone: 'success', text: `${ACTION_LABELS[action]} 처리를 완료했습니다.` })
    setConfirmAction(null)
    setConfirmReason('')
    if (action === 'delete') setSelectedId(null)
    await refetch()
  }

  return (
    <AppLayout active="admin" isAdmin={profile?.is_admin} showFooter={false}>
      <div className="admin-console">
        <header className="admin-console-header responsive-section">
          <div>
            <div className="admin-console-eyebrow">
              <span>ADMIN CONSOLE</span>
              <Badge tone="brand">운영자</Badge>
              <Badge tone={stats.schemaVersion === 'admin-console-v2' ? 'brandSoft' : 'hold'}>
                {stats.schemaVersion === 'admin-console-v2' ? 'DB v2 연결' : '호환 모드'}
              </Badge>
            </div>
            <h1>학생회 운영 콘솔</h1>
            <p>{profile?.name ?? '관리자'} · {profile?.email ?? '운영자 이메일 미등록'} · 대전대신고등학교 학생회</p>
          </div>
          <div className="admin-header-actions">
            <div className="admin-sync-state">
              <span className={loading ? 'live-dot' : ''} />
              {loading ? '동기화 중' : `${relativeTime(refreshedAt)} 동기화`}
            </div>
            <Btn variant="outline" size="sm" onClick={() => navigate('/archive')}>학생 화면 보기</Btn>
            <Btn variant="brand" size="sm" onClick={refetch} disabled={loading}>새로고침</Btn>
          </div>
        </header>

        <nav className="admin-console-nav responsive-section" aria-label="관리자 메뉴">
          {ADMIN_SECTIONS.map(item => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? 'active' : ''}
              onClick={() => setSection(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              {item.id === 'reports' && stats.reportedProposals > 0 && <em>{stats.reportedProposals}</em>}
            </button>
          ))}
        </nav>

        <main className="admin-console-main responsive-section">
          {error && (
            <div className="admin-alert admin-alert-error" role="alert">
              <div><strong>일부 관리자 데이터를 불러오지 못했습니다.</strong><span>{error}</span></div>
              <button type="button" onClick={refetch}>다시 불러오기</button>
            </div>
          )}
          {!isAdminConsoleV2 && !loading && (
            <div className="admin-alert admin-alert-compat" role="note">
              <div>
                <strong>현재 운영 DB는 호환 모드입니다.</strong>
                <span>상태 변경·공식 답변·블라인드·신고 해제·영구 삭제는 사용할 수 있으며, 처리 기록·휴지통·감사 로그는 DB v2 적용 후 활성화됩니다.</span>
              </div>
            </div>
          )}
          {actionMessage && (
            <div className={`admin-alert admin-alert-${actionMessage.tone}`} role="status">
              <div><strong>{actionMessage.tone === 'success' ? '처리 완료' : '확인 필요'}</strong><span>{actionMessage.text}</span></div>
              <button type="button" onClick={() => setActionMessage(null)}>닫기</button>
            </div>
          )}

          {section === 'overview' && (
            <>
              <section className="admin-section-heading">
                <div><span>TODAY</span><h2>오늘 처리할 업무</h2></div>
                <p>신고 안건과 30표 달성 안건을 우선 확인하세요.</p>
              </section>

              <div className="admin-kpi-grid">
                <KpiCard label="진행 안건" value={stats.active} detail="학생 추천 진행 중" onClick={() => { setScope('all'); setSection('proposals') }} />
                <KpiCard label="선정 임박" value={stats.nearThreshold} detail="추천 20~29표" tone="brand" onClick={() => { setScope('near'); setSection('proposals') }} />
                <KpiCard label="처리 대기" value={stats.selected} detail="30표 달성·학생회 전달" tone="hold" onClick={() => { setScope('open'); setSection('proposals') }} />
                <KpiCard label="협의 중" value={stats.discussing} detail="학교와 협의 진행" tone="hold" onClick={() => { setScope('open'); setSection('proposals') }} />
                <KpiCard label="신고 처리" value={stats.reportedProposals} detail={`누적 신고 ${stats.totalReports}건`} tone={stats.reportedProposals ? 'warn' : 'default'} onClick={() => setSection('reports')} />
                <KpiCard label="이번 달 반영" value={stats.doneThisMonth} detail="반영 완료 안건" tone="brand" onClick={() => { setScope('completed'); setSection('proposals') }} />
              </div>

              <div className="admin-overview-grid">
                <section className="admin-panel">
                  <div className="admin-panel-header">
                    <div><span>PRIORITY QUEUE</span><h3>우선 처리 목록</h3></div>
                    <strong>{priorityItems.length}건</strong>
                  </div>
                  {loading ? (
                    <div className="admin-empty">운영 데이터를 불러오는 중입니다.</div>
                  ) : priorityItems.length === 0 ? (
                    <div className="admin-empty admin-empty-positive"><b>✓</b><strong>긴급 처리할 업무가 없습니다.</strong><span>새 신고 또는 20표 이상 안건이 생기면 이곳에 표시됩니다.</span></div>
                  ) : (
                    <div className="admin-priority-list">
                      {priorityItems.map(item => (
                        <button key={item.key} type="button" onClick={() => { setSection(item.section); openProposal(item.proposal) }}>
                          <span className={`admin-priority-dot ${item.tone}`} />
                          <span className="admin-priority-copy"><strong>{item.proposal.title}</strong><small>{item.detail}</small></span>
                          <Badge tone={item.tone === 'warn' ? 'warn' : item.tone === 'brand' ? 'brandSoft' : 'hold'}>{item.label}</Badge>
                          <span aria-hidden="true">→</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="admin-panel">
                  <div className="admin-panel-header">
                    <div><span>RECENT ACTIVITY</span><h3>최근 운영 기록</h3></div>
                    <button type="button" onClick={() => setSection('activity')}>전체 보기</button>
                  </div>
                  {!activityAvailable ? (
                    <div className="admin-empty"><strong>DB 마이그레이션 적용 대기</strong><span>적용 후 모든 운영 조치가 자동 기록됩니다.</span></div>
                  ) : activity.length === 0 ? (
                    <div className="admin-empty"><strong>아직 운영 기록이 없습니다.</strong><span>상태 변경이나 신고 처리 후 표시됩니다.</span></div>
                  ) : (
                    <div className="admin-activity-compact">
                      {activity.slice(0, 6).map(item => (
                        <button key={item.id} type="button" onClick={() => item.proposalId && setSelectedId(item.proposalId)}>
                          <span />
                          <div><strong>{ACTIVITY_LABELS[item.action] ?? item.action}</strong><small>{item.proposalTitle ?? '삭제된 안건'} · {relativeTime(item.createdAt)}</small></div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="admin-system-strip">
                    <span>등록 계정 <strong>{stats.profiles}</strong></span>
                    <span>블라인드 <strong>{stats.blinded}</strong></span>
                    <span>휴지통 <strong>{stats.trashed}</strong></span>
                  </div>
                </section>
              </div>
            </>
          )}

          {section === 'proposals' && (
            <>
              <section className="admin-section-heading admin-section-heading-row">
                <div><span>PROPOSAL OPERATIONS</span><h2>안건 관리</h2></div>
                <p>검색·분류·상태 변경·공식 답변을 한곳에서 처리합니다.</p>
              </section>

              <section className="admin-panel admin-proposal-panel">
                <div className="admin-filter-tabs" role="tablist" aria-label="안건 상태 필터">
                  {SCOPE_TABS.map(tab => (
                    <button key={tab.id} type="button" className={scope === tab.id ? 'active' : ''} onClick={() => setScope(tab.id)}>
                      {tab.label}
                      {tab.id === 'near' && stats.nearThreshold > 0 && <span>{stats.nearThreshold}</span>}
                      {tab.id === 'open' && stats.selected + stats.discussing > 0 && <span>{stats.selected + stats.discussing}</span>}
                    </button>
                  ))}
                </div>
                <div className="admin-filter-bar">
                  <label className="admin-search-field">
                    <span aria-hidden="true">⌕</span>
                    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="제목, 본문, 발의자 이메일 검색" />
                  </label>
                  <select value={category} onChange={event => setCategory(event.target.value as 'all' | ProposalCategory)} aria-label="카테고리 필터">
                    <option value="all">전체 카테고리</option>
                    {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={sort} onChange={event => setSort(event.target.value as ProposalSort)} aria-label="정렬 방식">
                    <option value="updated">최근 처리순</option>
                    <option value="votes">추천 높은순</option>
                    <option value="reports">신고 많은순</option>
                    <option value="oldest">오래된순</option>
                  </select>
                </div>

                <div className="admin-table-summary"><strong>{filteredProposals.length}건</strong><span>최대 100건 표시</span></div>
                {loading ? (
                  <div className="admin-empty">안건을 불러오는 중입니다.</div>
                ) : filteredProposals.length === 0 ? (
                  <div className="admin-empty admin-empty-positive"><b>✓</b><strong>조건에 맞는 안건이 없습니다.</strong><span>검색어나 필터를 변경해보세요.</span></div>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-proposal-table">
                      <thead><tr><th>안건</th><th>추천 진행</th><th>활동</th><th>상태</th><th>최근 변경</th><th aria-label="열기" /></tr></thead>
                      <tbody>
                        {filteredProposals.map(proposal => (
                          <tr key={proposal.id} onClick={() => openProposal(proposal)}>
                            <td>
                              <div className="admin-title-cell"><span>{proposal.category}</span><strong>{proposal.title}</strong><small>{proposal.is_anonymous ? '익명 제안' : proposal.author_name ?? '이름 미등록'} · {proposal.author_grade ? `${proposal.author_grade}학년` : '학년 미등록'}</small></div>
                            </td>
                            <td><div className="admin-vote-cell"><strong>{proposal.vote_count}표</strong><ProgressBar value={proposal.vote_count} height={5} /></div></td>
                            <td><div className="admin-count-cell"><span>댓글 {proposal.comment_count}</span><span className={proposal.report_count ? 'warn' : ''}>신고 {proposal.report_count}</span></div></td>
                            <td><StatusBadge proposal={proposal} /></td>
                            <td><span className="admin-date-cell">{relativeTime(proposal.updated_at)}<small>{formatDate(proposal.updated_at, false)}</small></span></td>
                            <td><button type="button" className="admin-row-open" onClick={event => { event.stopPropagation(); openProposal(proposal) }} aria-label={`${proposal.title} 관리`}>→</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {section === 'reports' && (
            <>
              <section className="admin-section-heading admin-section-heading-row">
                <div><span>MODERATION</span><h2>신고 관리</h2></div>
                <p>신고 3회 이상 안건의 모든 사유를 검토하고 공개 여부를 결정합니다.</p>
              </section>
              {loading ? (
                <div className="admin-panel admin-empty">신고 목록을 불러오는 중입니다.</div>
              ) : reports.length === 0 ? (
                <div className="admin-panel admin-empty admin-empty-positive"><b>✓</b><strong>처리할 신고 게시글이 없습니다.</strong><span>신고가 3회 누적되면 이곳에 나타납니다.</span></div>
              ) : (
                <div className="admin-report-grid">
                  {reports.map(item => (
                    <ReportCard
                      key={item.proposal.id}
                      item={item}
                      busy={busyAction !== null}
                      onOpen={() => openProposal(item.proposal)}
                      onAction={action => { setConfirmAction({ action, proposal: item.proposal }); setConfirmReason('') }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {section === 'activity' && (
            <>
              <section className="admin-section-heading admin-section-heading-row">
                <div><span>AUDIT TRAIL</span><h2>운영 기록</h2></div>
                <p>운영진과 시스템이 수행한 주요 조치를 시간순으로 확인합니다.</p>
              </section>
              <section className="admin-panel">
                {!activityAvailable ? (
                  <div className="admin-empty"><strong>운영 기록 DB 적용이 필요합니다.</strong><span>관리자 콘솔 v2 마이그레이션 적용 후 기록이 시작됩니다.</span></div>
                ) : activity.length === 0 ? (
                  <div className="admin-empty"><strong>저장된 운영 기록이 없습니다.</strong><span>상태 변경·신고 처리·공식 답변 작성 후 자동으로 남습니다.</span></div>
                ) : (
                  <div className="admin-activity-timeline">
                    {activity.map(item => (
                      <article key={item.id}>
                        <span className="admin-timeline-dot" />
                        <div className="admin-timeline-main">
                          <div><Badge tone={item.action.includes('delete') || item.action.includes('blind') ? 'warn' : item.action.includes('status') || item.action.includes('selected') ? 'brandSoft' : 'default'}>{ACTIVITY_LABELS[item.action] ?? item.action}</Badge><time>{formatDate(item.createdAt)}</time></div>
                          <button type="button" onClick={() => item.proposalId && setSelectedId(item.proposalId)} disabled={!item.proposalId}>{item.proposalTitle ?? '삭제된 안건'}</button>
                          <p>{activityDescription(item)}</p>
                          <small>{item.adminName ?? item.adminEmail ?? '시스템 자동 처리'}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {selectedProposal && (
        <div className="admin-drawer-backdrop" role="presentation" onMouseDown={() => setSelectedId(null)}>
          <aside className="admin-detail-drawer" role="dialog" aria-modal="true" aria-label="안건 관리 상세" onMouseDown={event => event.stopPropagation()}>
            <div className="admin-drawer-header">
              <div><span>{selectedProposal.category}</span><StatusBadge proposal={selectedProposal} /></div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="상세 패널 닫기">×</button>
            </div>
            <div className="admin-drawer-content">
              <h2>{selectedProposal.title}</h2>
              <p className="admin-proposal-body">{selectedProposal.body}</p>
              <div className="admin-drawer-stats">
                <span><strong>{selectedProposal.vote_count}</strong>추천</span>
                <span><strong>{selectedProposal.comment_count}</strong>댓글</span>
                <span className={selectedProposal.report_count ? 'warn' : ''}><strong>{selectedProposal.report_count}</strong>신고</span>
                <span><strong>{selectedProposal.view_count}</strong>조회</span>
              </div>
              <ProgressBar value={selectedProposal.vote_count} showLabel />

              <section className="admin-drawer-section admin-author-card">
                <div><span>발의자 정보</span><Badge tone={selectedProposal.is_anonymous ? 'hold' : 'outline'}>{selectedProposal.is_anonymous ? '학생 화면 익명' : '공개 작성'}</Badge></div>
                <strong>{selectedProposal.author_name ?? '이름 미등록'}</strong>
                <p>{selectedProposal.author_email ?? '이메일 정보 없음'}</p>
                <small>{selectedProposal.author_grade ? `${selectedProposal.author_grade}학년` : '학년 미등록'} · {selectedProposal.author_class ? `${selectedProposal.author_class}반` : '반 미등록'} · 작성 {formatDate(selectedProposal.created_at)}</small>
              </section>

              {selectedProposal.moderation_reason && (
                <div className="admin-moderation-notice"><strong>현재 공개 제한 사유</strong><span>{selectedProposal.moderation_reason}</span></div>
              )}

              <section className="admin-drawer-section">
                <div className="admin-drawer-section-title"><div><span>WORKFLOW</span><h3>처리 상태 변경</h3></div><StatusBadge proposal={selectedProposal} /></div>
                <label className="admin-field">
                  <span>새 상태</span>
                  <select
                    value={statusDraft}
                    onChange={event => setStatusDraft(event.target.value as Exclude<ProposalStatus, 'blinded'>)}
                    disabled={selectedProposal.moderation_status !== 'visible'}
                  >
                    {STATUS_OPTIONS.map(status => (
                      <option key={status} value={status} disabled={status !== 'active' && selectedProposal.vote_count < 30}>
                        {PROPOSAL_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedProposal.vote_count < 30 && (
                  <div className="admin-workflow-gate" role="note">
                    선정까지 {30 - selectedProposal.vote_count}표가 남아 처리 단계 변경이 잠겨 있습니다.
                  </div>
                )}
                {!isAdminConsoleV2 && (
                  <div className="admin-workflow-gate" role="note">
                    호환 모드에서는 상태만 변경됩니다. 공개 처리 내용과 내부 메모는 DB v2 적용 후 저장할 수 있습니다.
                  </div>
                )}
                <label className="admin-field">
                  <span>학생에게 공개할 처리 내용 {isAdminConsoleV2 && (statusDraft === 'done' || statusDraft === 'rejected') ? '(필수)' : '(선택)'}</span>
                  <textarea rows={3} value={publicMessage} onChange={event => setPublicMessage(event.target.value)} placeholder="처리 결과나 다음 진행 상황을 작성하세요." maxLength={500} disabled={!isAdminConsoleV2} />
                </label>
                <label className="admin-field">
                  <span>운영진 내부 메모</span>
                  <textarea rows={2} value={internalNote} onChange={event => setInternalNote(event.target.value)} placeholder="학생에게 공개되지 않는 메모입니다." maxLength={1000} disabled={!isAdminConsoleV2} />
                </label>
                <Btn
                  variant="brand"
                  size="md"
                  full
                  onClick={handleStatusSave}
                  disabled={busyAction !== null || selectedProposal.moderation_status !== 'visible' || (statusDraft !== 'active' && selectedProposal.vote_count < 30)}
                >
                  {busyAction === `${selectedProposal.id}:status` ? '저장 중…' : '상태와 처리 기록 저장'}
                </Btn>
              </section>

              <section className="admin-drawer-section">
                <div className="admin-drawer-section-title"><div><span>OFFICIAL REPLY</span><h3>학생회 공식 답변</h3></div>{selectedProposal.official_reply_content && <Badge tone="brandSoft">등록됨</Badge>}</div>
                <label className="admin-field"><span>답변 내용</span><textarea rows={5} value={replyContent} onChange={event => setReplyContent(event.target.value)} placeholder="학생회 공식 입장과 처리 결과를 작성하세요." maxLength={1200} /></label>
                <label className="admin-field"><span>서명자</span><input value={replySignedBy} onChange={event => setReplySignedBy(event.target.value)} placeholder="예: 제35대 학생회" maxLength={40} /></label>
                <Btn variant="outline" size="md" full onClick={handleReplySave} disabled={busyAction !== null}>{busyAction === `${selectedProposal.id}:reply` ? '저장 중…' : '공식 답변 저장'}</Btn>
              </section>

              <section className="admin-drawer-section">
                <div className="admin-drawer-section-title"><div><span>MODERATION</span><h3>공개 및 삭제 관리</h3></div></div>
                <div className="admin-moderation-actions">
                  {selectedProposal.moderation_status === 'visible' && <Btn variant="outline" size="sm" onClick={() => { setConfirmAction({ action: 'blind', proposal: selectedProposal }); setConfirmReason('') }}>블라인드</Btn>}
                  {selectedProposal.moderation_status === 'blinded' && <Btn variant="outline" size="sm" onClick={() => { setConfirmAction({ action: 'unblind', proposal: selectedProposal }); setConfirmReason('') }}>블라인드 해제</Btn>}
                  {isAdminConsoleV2 && selectedProposal.moderation_status !== 'trashed' && <Btn variant="danger" size="sm" onClick={() => { setConfirmAction({ action: 'trash', proposal: selectedProposal }); setConfirmReason('') }}>휴지통 이동</Btn>}
                  {isAdminConsoleV2 && selectedProposal.moderation_status === 'trashed' && <Btn variant="outline" size="sm" onClick={() => { setConfirmAction({ action: 'restore', proposal: selectedProposal }); setConfirmReason('') }}>게시물 복구</Btn>}
                  <Btn variant="danger" size="sm" onClick={() => { setConfirmAction({ action: 'delete', proposal: selectedProposal }); setConfirmReason('') }}>영구 삭제</Btn>
                </div>
                <Btn variant="ghost" size="sm" full onClick={() => navigate(`/proposals/${selectedProposal.id}`)}>학생 화면 원문 열기 →</Btn>
              </section>
            </div>
          </aside>
        </div>
      )}

      {confirmAction && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={() => !busyAction && setConfirmAction(null)}>
          <div className="admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" onMouseDown={event => event.stopPropagation()}>
            <div className="admin-confirm-icon">!</div>
            <h2 id="admin-confirm-title">{ACTION_LABELS[confirmAction.action]}</h2>
            <p><strong>{confirmAction.proposal.title}</strong> 안건을 처리합니다. 사유는 운영 기록에 남습니다.</p>
            {confirmAction.action === 'delete' && <div className="admin-danger-copy">영구 삭제 후에는 게시글과 연결된 댓글·추천을 복구할 수 없습니다.</div>}
            <label className="admin-field"><span>처리 사유</span><textarea rows={3} value={confirmReason} onChange={event => setConfirmReason(event.target.value)} placeholder="구체적인 처리 사유를 3자 이상 입력하세요." maxLength={300} autoFocus /></label>
            <div className="admin-confirm-actions"><Btn variant="outline" size="md" onClick={() => setConfirmAction(null)} disabled={busyAction !== null}>취소</Btn><Btn variant={confirmAction.action === 'delete' ? 'danger' : 'brand'} size="md" onClick={handleConfirmedAction} disabled={busyAction !== null}>{busyAction ? '처리 중…' : ACTION_LABELS[confirmAction.action]}</Btn></div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function ReportCard({
  item,
  busy,
  onOpen,
  onAction,
}: {
  item: AdminReportItem
  busy: boolean
  onOpen: () => void
  onAction: (action: ConfirmAction) => void
}) {
  const proposal = item.proposal
  const isBlinded = proposal.moderation_status === 'blinded' || proposal.status === 'blinded'
  return (
    <article className="admin-report-card">
      <div className="admin-report-card-head">
        <div><Badge tone="warn">신고 {item.reportCount}회</Badge><StatusBadge proposal={proposal} /></div>
        <time>{relativeTime(item.latestAt)}</time>
      </div>
      <span className="admin-report-category">{proposal.category}</span>
      <h3>{proposal.title}</h3>
      <p>{proposal.body}</p>
      <div className="admin-report-author">발의자 {proposal.author_email ?? '이메일 정보 없음'} · {proposal.is_anonymous ? '학생 화면 익명' : '공개 작성'}</div>
      <div className="admin-report-reasons">
        <strong>접수된 신고 사유</strong>
        {item.reasons.map((reason, index) => (
          <div key={reason.id ?? `${proposal.id}-${index}`}><span>{index + 1}</span><p>{reason.reason || '사유 미입력'}</p><time>{formatDate(reason.created_at, false)}</time></div>
        ))}
      </div>
      <div className="admin-report-card-actions">
        <Btn variant="outline" size="sm" onClick={onOpen}>원문·상세</Btn>
        <Btn variant="outline" size="sm" onClick={() => onAction('resolve_reports')} disabled={busy}>신고 해제</Btn>
        <Btn variant={isBlinded ? 'outline' : 'brand'} size="sm" onClick={() => onAction(isBlinded ? 'unblind' : 'blind')} disabled={busy}>{isBlinded ? '블라인드 해제' : '블라인드'}</Btn>
        <Btn variant="danger" size="sm" onClick={() => onAction('trash')} disabled={busy}>휴지통</Btn>
      </div>
    </article>
  )
}
