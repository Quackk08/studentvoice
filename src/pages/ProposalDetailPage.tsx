import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import Btn from '../components/shared/Btn'
import ProgressBar from '../components/shared/ProgressBar'
import OfficialReplyCard, { getDisplayableOfficialReply } from '../components/shared/OfficialReplyCard'
import ProposalStatusTimeline from '../components/shared/ProposalStatusTimeline'
import { useAuth } from '../contexts/AuthContext'
import {
  useProposal, voteProposal, unvoteProposal, checkUserVoted,
  saveProposal, unsaveProposal, checkUserSaved, getSavesCount,
  useComments, addComment, deleteComment,
  reportProposal, deleteProposal, adminDeleteProposal, updateProposal,
  useProposalStatusHistory,
} from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONES } from '../lib/proposalStatus'
import type { ProposalCategory } from '../types/database'

const CATS: ProposalCategory[] = ['#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타']

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

function relativeTime(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

// ── Simple overlay modal ──────────────────────────────────────
function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.surface, borderRadius: 20,
          padding: 32, width: 480, maxWidth: '90vw',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 20 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  )
}

export default function ProposalDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const { data: proposal, loading, error: proposalError, refetch } = useProposal(id ?? '')
  const { data: comments, refetch: refetchComments } = useComments(id ?? '')
  const { data: statusHistory } = useProposalStatusHistory(id ?? '')

  const IS_ADMIN = profile?.is_admin ?? false
  const existingReply = getDisplayableOfficialReply(proposal?.official_replies, proposal?.status)
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Vote / Save ──────────────────────────────────────────
  const [voted, setVoted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savesCount, setSavesCount] = useState(0)
  const [voteLoading, setVoteLoading] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    checkUserVoted(id, user.id).then(setVoted)
    checkUserSaved(id, user.id).then(setSaved)
  }, [user, id])

  useEffect(() => {
    if (!id) return
    getSavesCount(id).then(setSavesCount)
  }, [id])

  const handleVote = async () => {
    if (!user || !id) { navigate('/login'); return }
    setVoteLoading(true)
    setActionError(null)
    try {
      const result = voted
        ? await unvoteProposal(id, user.id)
        : await voteProposal(id, user.id)
      if (result.error) { setActionError(`추천을 처리하지 못했습니다: ${result.error}`); return }
      setVoted(!voted)
      await refetch()
    } finally {
      setVoteLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user || !id) { navigate('/login'); return }
    setActionError(null)
    const result = saved
      ? await unsaveProposal(id, user.id)
      : await saveProposal(id, user.id)
    if (result.error) { setActionError(`저장을 처리하지 못했습니다: ${result.error}`); return }
    setSaved(!saved)
    setSavesCount(c => saved ? Math.max(0, c - 1) : c + 1)
  }

  // ── Comments ──────────────────────────────────────────────
  const [commentText, setCommentText] = useState('')
  const [commentAnon, setCommentAnon] = useState(true)
  const [commentLoading, setCommentLoading] = useState(false)

  const handleAddComment = async () => {
    if (!user || !id || !commentText.trim()) return
    setCommentLoading(true)
    setActionError(null)
    try {
      const { error } = await addComment(id, user.id, commentText.trim(), commentAnon)
      if (error) { setActionError(`댓글을 등록하지 못했습니다: ${error}`); return }
      setCommentText('')
      await Promise.all([refetchComments(), refetch()])
    } finally {
      setCommentLoading(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    setActionError(null)
    const { error } = await deleteComment(commentId)
    if (error) { setActionError(`댓글을 삭제하지 못했습니다: ${error}`); return }
    await Promise.all([refetchComments(), refetch()])
  }

  // ── Report ───────────────────────────────────────────────
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportDone, setReportDone] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const handleReport = async () => {
    if (!user || !id) return
    setReportLoading(true)
    setReportError(null)
    const { error } = await reportProposal(id, user.id, reportReason)
    setReportLoading(false)
    if (error?.includes('duplicate')) {
      setReportDone(true)
      setReportOpen(false)
      return
    }
    if (error) { setReportError(`신고하지 못했습니다: ${error}`); return }
    setReportDone(true)
    setReportOpen(false)
    setReportReason('')
  }

  // ── Edit ─────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editCat, setEditCat] = useState<ProposalCategory>('#시설')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = () => {
    if (!proposal) return
    setEditTitle(proposal.title)
    setEditBody(proposal.body)
    setEditCat(proposal.category)
    setEditError(null)
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditError(null)
  }

  const saveEdit = async () => {
    if (editTitle.length < 5) { setEditError('제목을 5자 이상 입력해주세요.'); return }
    if (editBody.length < 50) { setEditError('본문을 50자 이상 입력해주세요.'); return }
    if (!id) return
    setEditSaving(true)
    const { error } = await updateProposal(id, { title: editTitle, body: editBody, category: editCat })
    setEditSaving(false)
    if (error) { setEditError('수정 중 오류가 발생했습니다.'); return }
    await refetch()
    setEditMode(false)
  }

  // ── Delete ───────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!id) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const { error } = IS_ADMIN ? await adminDeleteProposal(id) : await deleteProposal(id)
      if (error) { setDeleteError(`삭제하지 못했습니다: ${error}`); return }
      navigate('/home')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Derived values ──────────────────────────────────────
  const voteCount    = proposal?.vote_count   ?? 0
  const viewCount    = proposal?.view_count   ?? 0
  const commentCount = comments.length
  const title        = editMode ? editTitle : (proposal?.title    ?? '안건을 불러오는 중…')
  const body         = editMode ? editBody  : (proposal?.body     ?? '')
  const category     = editMode ? editCat   : (proposal?.category ?? '#시설')
  const createdAt    = proposal?.created_at ?? new Date().toISOString()
  const isMyProposal = user && proposal?.author_id === user.id
  const canEdit      = isMyProposal && proposal?.status === 'active'
  if (!loading && !proposal) {
    return (
      <AppLayout active="proposals" isAdmin={IS_ADMIN}>
        <section className="responsive-section" style={{ padding: '80px 48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>안건을 찾을 수 없습니다</h1>
          <p style={{ color: COLORS.inkSub }}>{proposalError ? '안건을 불러오는 중 오류가 발생했습니다.' : '삭제되었거나 접근할 수 없는 안건입니다.'}</p>
          <Btn variant="primary" size="md" onClick={() => navigate('/proposals')}>전체 안건으로</Btn>
        </section>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      active={
        proposal?.status === 'active' && (proposal?.vote_count ?? 0) >= 20 ? 'home' :
        proposal?.status === 'active' ? 'proposals' :
        'archive'
      }
      isAdmin={IS_ADMIN}
    >
      <section className="responsive-section" style={{ padding: '40px 48px 80px', background: COLORS.bg }}>
        <div className="responsive-grid" style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 32 }}>

          {/* ── Main content ── */}
          <div>
            {loading && <div style={{ fontSize: 14, color: COLORS.inkMuted }}>불러오는 중…</div>}
            {actionError && <div role="alert" style={{ padding: '11px 13px', marginBottom: 16, borderRadius: 9, background: COLORS.warnSoft, color: COLORS.warn, fontSize: 12 }}>{actionError}</div>}

            {/* Breadcrumb — 안건 상태·추천 수에 따라 상위 경로 결정 */}
            {(() => {
              const isActive  = proposal?.status === 'active'
              const isPopular = isActive && (proposal?.vote_count ?? 0) >= 20

              // 상위 경로 결정
              const [parentLabel, parentPath] =
                isPopular  ? ['인기 이슈',       '/home']     :
                isActive   ? ['전체 안건',        '/proposals']:
                             ['답변 · 아카이브', '/archive']

              return (
                <div style={{ fontSize: 12, color: COLORS.inkSub, marginBottom: 16 }}>
                  {/* 최상위: 인기이슈 출발이면 홈, 나머지는 바로 상위 */}
                  {isPopular ? (
                    <>
                      <span onClick={() => navigate('/home')} style={{ cursor: 'pointer' }}>홈</span>
                      <span style={{ margin: '0 6px', color: COLORS.inkMuted }}>/</span>
                      <span onClick={() => navigate('/home')} style={{ cursor: 'pointer' }}>인기 이슈</span>
                    </>
                  ) : (
                    <span onClick={() => navigate(parentPath)} style={{ cursor: 'pointer' }}>
                      {parentLabel}
                    </span>
                  )}
                  <span style={{ margin: '0 6px', color: COLORS.inkMuted }}>/</span>
                  <span style={{ color: COLORS.ink, fontWeight: 500 }}>안건 상세</span>
                </div>
              )
            })()}

            {/* Category selector (edit mode) or tags (read mode) */}
            {editMode ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {CATS.map(c => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setEditCat(c)}
                    aria-pressed={c === editCat}
                    style={{
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                      background: c === editCat ? COLORS.ink : COLORS.surface,
                      color: c === editCat ? '#fff' : COLORS.inkSub,
                      border: `1px solid ${c === editCat ? COLORS.ink : COLORS.line}`,
                      cursor: 'pointer',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <TagPill>{category}</TagPill>
                {voteCount >= 20 && proposal?.status === 'active' && (
                  <Badge tone="fire">🔥 인기 급상승</Badge>
                )}
                {proposal?.status && proposal.status !== 'active' && (
                  <Badge tone={PROPOSAL_STATUS_TONES[proposal.status]}>
                    {PROPOSAL_STATUS_LABELS[proposal.status]}
                  </Badge>
                )}
                <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                  {new Date(createdAt).toLocaleDateString('ko-KR')} · {relativeTime(createdAt)}
                </span>
              </div>
            )}

            {/* Title */}
            {editMode ? (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                maxLength={60}
                style={{
                  width: '100%', fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em',
                  border: `1.5px solid ${COLORS.brand}`, borderRadius: 10,
                  padding: '10px 16px', fontFamily: 'inherit', color: COLORS.ink,
                  background: COLORS.surface, outline: 'none', boxSizing: 'border-box', marginBottom: 16,
                }}
              />
            ) : (
              <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.2, color: COLORS.ink, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {title}
              </h1>
            )}

            {/* Author meta */}
            {!editMode && (
              <div
                className="proposal-author-meta"
                style={{
                  marginTop: 22, padding: '14px 0',
                  borderTop: `1px solid ${COLORS.lineSoft}`, borderBottom: `1px solid ${COLORS.lineSoft}`,
                  display: 'flex', alignItems: 'center', gap: 16, fontSize: 12.5, color: COLORS.inkSub,
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 99, background: COLORS.surfaceAlt, display: 'grid', placeItems: 'center', fontSize: 13 }}>
                  🎭
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                    {proposal?.is_anonymous
                      ? `익명의 대신인 · ${proposal.author_grade ?? '?'}학년`
                      : (proposal?.author_name ?? (proposal?.author_grade ? `${proposal.author_grade}학년 학생` : '작성자'))}
                  </div>
                  {IS_ADMIN && proposal && (
                    <div style={{ fontSize: 11, color: COLORS.warn, marginTop: 3, fontWeight: 500 }}>
                      ⓘ 발의자: {proposal.author_email ?? '(이메일 없음)'} (운영자에게만 표시)
                    </div>
                  )}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, alignItems: 'center' }}>
                  <span>조회 {viewCount}</span>
                  <span>💬 {commentCount}</span>
                </div>
              </div>
            )}

            {/* Body */}
            {editMode ? (
              <>
                <textarea
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  maxLength={2000}
                  rows={12}
                  style={{
                    width: '100%', fontSize: 14, color: COLORS.ink, lineHeight: 1.85,
                    border: `1.5px solid ${COLORS.brand}`, borderRadius: 10,
                    padding: '14px 16px', fontFamily: 'inherit', background: COLORS.surface,
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginTop: 16,
                  }}
                />
                {editError && (
                  <div style={{ fontSize: 12, color: COLORS.warn, marginTop: 8 }}>{editError}</div>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <Btn variant="outline" size="md" onClick={cancelEdit}>취소</Btn>
                  <Btn variant="brand" size="md" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? '저장 중…' : '수정 저장'}
                  </Btn>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 15, color: COLORS.ink, lineHeight: 1.85, marginTop: 28, letterSpacing: '-0.005em', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {body}
              </div>
            )}

            {!editMode && existingReply && (
              <div style={{ marginTop: 32 }}>
                <OfficialReplyCard reply={existingReply} />
              </div>
            )}

            {!editMode && <ProposalStatusTimeline events={statusHistory} />}

            {/* Action buttons (only in read mode) */}
            {!editMode && (
              <div className="proposal-actions" style={{ marginTop: 36, display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={handleVote}
                  disabled={voteLoading || proposal?.status !== 'active'}
                  style={{
                    flex: 1, height: 56, borderRadius: 12,
                    border: `1.5px solid ${voted ? COLORS.inkSub : COLORS.brand}`,
                    background: voted ? COLORS.surface : COLORS.brand,
                    color: voted ? COLORS.ink : '#fff',
                    fontSize: 15, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    cursor: (voteLoading || proposal?.status !== 'active') ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', letterSpacing: '-0.01em',
                    opacity: proposal?.status !== 'active' ? 0.5 : 1,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M10 16.5c-.3 0-.5-.1-.7-.3l-6-5.6C1.7 9 1 7.3 1 5.7c0-2.6 2-4.7 4.5-4.7 1.7 0 3.3.9 4.5 2.4C11.2 1.9 12.8 1 14.5 1 17 1 19 3.1 19 5.7c0 1.6-.7 3.3-2.3 4.9l-6 5.6c-.2.2-.4.3-.7.3Z"
                      fill={voted ? COLORS.inkSub : '#fff'} />
                  </svg>
                  {proposal?.status !== 'active' ? '선정된 안건' : voted ? '추천 취소' : '이 안건 추천하기'}
                </button>
                <Btn
                  variant="outline" size="lg"
                  style={{ width: 130, background: saved ? COLORS.surfaceAlt : undefined }}
                  onClick={handleSave}
                >
                  저장{saved ? ' ✓' : ''}
                </Btn>
                {!isMyProposal && (
                  <Btn
                    variant="outline" size="lg"
                    style={{
                      width: 130,
                      color: reportDone ? COLORS.inkMuted : COLORS.warn,
                      borderColor: reportDone ? COLORS.line : '#F2D6C2',
                    }}
                    onClick={() => { if (!reportDone) { setReportError(null); setReportOpen(true) } }}
                    disabled={reportDone}
                  >
                    {reportDone ? '신고 완료' : '신고'}
                  </Btn>
                )}
              </div>
            )}

            {/* ── Comments ── */}
            {!editMode && (
              <div style={{ marginTop: 48 }}>
                <div
                  style={{
                    fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em',
                    marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  의견
                  <span style={{ fontSize: 13, color: COLORS.inkMuted, fontWeight: 500 }}>
                    {commentCount}개
                  </span>
                </div>

                {/* Comment input */}
                {user && (
                  <div
                    style={{
                      background: COLORS.surface, border: `1px solid ${COLORS.line}`,
                      borderRadius: 14, padding: 18, marginBottom: 20,
                    }}
                  >
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="의견을 남겨주세요…"
                      rows={3}
                      style={{
                        width: '100%', border: 'none', outline: 'none', resize: 'none',
                        fontSize: 14, color: COLORS.ink, fontFamily: 'inherit',
                        background: 'transparent', letterSpacing: '-0.01em', lineHeight: 1.65,
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: COLORS.inkSub }}>
                        <input
                          type="checkbox"
                          checked={commentAnon}
                          onChange={event => setCommentAnon(event.target.checked)}
                        />
                        익명
                      </label>
                      <Btn
                        variant="primary" size="sm"
                        onClick={handleAddComment}
                        disabled={commentLoading || !commentText.trim()}
                      >
                        {commentLoading ? '게시 중…' : '게시'}
                      </Btn>
                    </div>
                  </div>
                )}

                {/* Comment list */}
                {comments.length === 0 ? (
                  <div style={{ padding: '32px 0', textAlign: 'center', color: COLORS.inkMuted, fontSize: 13 }}>
                    아직 의견이 없습니다. 첫 번째 의견을 남겨보세요.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {comments.map(c => {
                      const isOwn = user?.id === c.author_id
                      const authorLabel = c.is_anonymous
                        ? `익명 · ${c.author_grade ?? '?'}학년`
                        : (c.author_name ?? '학생')
                      return (
                        <div
                          key={c.id}
                          style={{
                            padding: '16px 18px', background: COLORS.surface,
                            border: `1px solid ${COLORS.line}`, borderRadius: 12,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 26, height: 26, borderRadius: 99,
                                  background: COLORS.surfaceAlt, display: 'grid', placeItems: 'center', fontSize: 12,
                                }}
                              >
                                {c.is_anonymous ? '🎭' : '👤'}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{authorLabel}</span>
                              <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                                {relativeTime(c.created_at)}
                              </span>
                            </div>
                            {(isOwn || IS_ADMIN) && (
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                style={{
                                  border: 'none', background: 'none', cursor: 'pointer',
                                  fontSize: 11, color: COLORS.inkMuted, padding: '2px 6px',
                                  fontFamily: 'inherit',
                                }}
                              >
                                삭제
                              </button>
                            )}
                          </div>
                          <p style={{ fontSize: 14, color: COLORS.ink, margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {c.content}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Vote progress */}
            <div
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: COLORS.brand,
                  marginBottom: 14,
                }}
              >
                VOTE PROGRESS
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: COLORS.ink, fontFeatureSettings: '"tnum"' }}>
                  {voteCount}
                </span>
                <span style={{ fontSize: 16, color: COLORS.inkMuted, fontWeight: 500 }}>/ 30표</span>
              </div>
              <div style={{ marginTop: 14 }}>
                <ProgressBar value={voteCount} max={30} height={10} />
              </div>
              {voteCount < 30 && proposal?.status === 'active' && (
                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#FFEFD9', fontSize: 12, color: '#7A4B0E', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🔥</span>
                  선정까지 단 <strong style={{ fontWeight: 700 }}>{30 - voteCount}표</strong>! 친구에게 공유해보세요.
                </div>
              )}
              {(voteCount >= 30 || (proposal?.status && proposal.status !== 'active')) && (
                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: COLORS.brandSoft, fontSize: 12, color: COLORS.brandDark, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>✓</span>
                  {proposal?.status === 'done' ? '반영 완료! 학교가 응답했습니다.' :
                   proposal?.status === 'rejected' ? '이 안건은 반려되었습니다.' :
                   '선정 완료! 학생회로 전달되었습니다.'}
                </div>
              )}
            </div>

            {/* My status */}
            <div
              style={{
                background: COLORS.ink,
                color: '#fff',
                borderRadius: 16,
                padding: 22,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 10,
                }}
              >
                내 상태
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                {isMyProposal
                  ? <><strong style={{ fontWeight: 700 }}>내가 작성</strong>한 안건입니다.</>
                  : voted
                  ? <><strong style={{ fontWeight: 700 }}>추천</strong>한 안건입니다.</>
                  : '아직 추천하지 않은 안건입니다.'}
              </div>
              {isMyProposal && (
                <>
                  <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                    {canEdit
                      ? '진행 중인 안건은 수정/삭제할 수 있습니다.'
                      : '선정된 안건은 수정/삭제할 수 없습니다.'}
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                    <button
                      disabled={!canEdit}
                      onClick={canEdit ? startEdit : undefined}
                      style={{
                        flex: 1, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.08)',
                        color: canEdit ? '#fff' : 'rgba(255,255,255,0.4)', border: 'none',
                        fontSize: 12, fontFamily: 'inherit', cursor: canEdit ? 'pointer' : 'not-allowed',
                      }}
                    >
                      수정
                    </button>
                    <button
                      disabled={!canEdit}
                      onClick={canEdit ? () => setDeleteConfirm(true) : undefined}
                      style={{
                        flex: 1, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.08)',
                        color: canEdit ? '#ff8a8a' : 'rgba(255,255,255,0.4)', border: 'none',
                        fontSize: 12, fontFamily: 'inherit', cursor: canEdit ? 'pointer' : 'not-allowed',
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Admin tools */}
            {IS_ADMIN && (
              <div
                style={{
                  background: COLORS.brandSoft,
                  border: `1px solid ${COLORS.brand}`,
                  borderRadius: 16,
                  padding: 22,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    color: COLORS.brand,
                    marginBottom: 12,
                  }}
                >
                  ⚙ 운영자 도구
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.65, color: COLORS.inkSub }}>
                  상태 변경, 공식 답변, 신고 및 공개 관리는 관리자 콘솔에서 하나의 처리 기록으로 관리합니다.
                </p>
                <Btn
                  variant="brand"
                  size="sm"
                  full
                  onClick={() => navigate(`/admin?view=proposals&proposal=${id}`)}
                >
                  관리자 콘솔에서 처리하기 →
                </Btn>
              </div>
            )}

            {/* Activity stats — real data */}
            <div
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 16,
                padding: 22,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: COLORS.inkSub,
                  marginBottom: 14,
                }}
              >
                ACTIVITY
              </div>
              {[
                ['추천', `${voteCount}명`],
                ['조회', `${viewCount}회`],
                ['의견', `${commentCount}개`],
                ['저장', `${savesCount}명`],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    fontSize: 13,
                    borderTop: `1px solid ${COLORS.lineSoft}`,
                  }}
                >
                  <span style={{ color: COLORS.inkSub }}>{k}</span>
                  <span style={{ color: COLORS.ink, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>

          </aside>
        </div>
      </section>

      {/* ── Report modal ── */}
      {reportOpen && (
        <Modal title="이 안건을 신고하시겠습니까?" onClose={() => setReportOpen(false)}>
          <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
            허위 사실, 욕설, 비방 등 커뮤니티 가이드라인에 위반되는 내용을 신고해 주세요.
            허위 신고 시 제재를 받을 수 있습니다.
          </p>
          <textarea
            value={reportReason}
            onChange={e => setReportReason(e.target.value)}
            placeholder="신고 사유를 입력해주세요 (선택)"
            rows={3}
            style={{
              width: '100%', border: `1px solid ${COLORS.line}`, borderRadius: 10,
              padding: '12px 14px', fontSize: 13, fontFamily: 'inherit',
              color: COLORS.ink, background: COLORS.surfaceAlt, outline: 'none',
              resize: 'none', boxSizing: 'border-box', marginBottom: 16,
            }}
          />
          {reportError && <div role="alert" style={{ fontSize: 12, color: COLORS.warn, marginBottom: 12 }}>{reportError}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="outline" size="md" onClick={() => setReportOpen(false)}>취소</Btn>
            <Btn
              variant="primary" size="md"
              style={{ background: COLORS.warn, borderColor: COLORS.warn }}
              onClick={handleReport}
              disabled={reportLoading}
            >
              {reportLoading ? '신고 중…' : '신고하기'}
            </Btn>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteConfirm && (
        <Modal title="안건을 삭제하시겠습니까?" onClose={() => setDeleteConfirm(false)}>
          <p style={{ fontSize: 13, color: COLORS.inkSub, marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
            삭제된 안건은 복구할 수 없습니다. 정말로 삭제하시겠습니까?
          </p>
          {deleteError && <div role="alert" style={{ fontSize: 12, color: COLORS.warn, marginBottom: 12 }}>{deleteError}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="outline" size="md" onClick={() => setDeleteConfirm(false)}>취소</Btn>
            <Btn
              variant="primary" size="md"
              style={{ background: COLORS.warn, borderColor: COLORS.warn }}
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? '삭제 중…' : '삭제하기'}
            </Btn>
          </div>
        </Modal>
      )}

    </AppLayout>
  )
}
