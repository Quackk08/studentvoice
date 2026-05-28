import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Badge from '../components/shared/Badge'
import Btn from '../components/shared/Btn'
import ProgressBar from '../components/shared/ProgressBar'
import { useAuth } from '../contexts/AuthContext'
import {
  useProposal, voteProposal, unvoteProposal, checkUserVoted,
  saveProposal, unsaveProposal, checkUserSaved, getSavesCount,
  useComments, addComment, deleteComment,
  reportProposal, deleteProposal, updateProposal,
  upsertOfficialReply, adminUpdateStatus,
} from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import type { ProposalCategory } from '../types/database'

const CATS: ProposalCategory[] = ['#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타']

function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.75 rounded-1 bg-surface-alt text-ink-sub border border-line">
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-surface rounded-5 p-8 w-full max-w-[480px] mx-4"
        style={{ boxShadow: '0 20px 60px -10px rgba(0,0,0,0.3)' }}
      >
        <div className="text-2xl font-bold mb-5" style={{ letterSpacing: '-0.02em' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

export default function ProposalDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const { data: proposal, loading, refetch } = useProposal(id ?? '')
  const { data: comments, refetch: refetchComments } = useComments(id ?? '')

  const IS_ADMIN = profile?.is_admin ?? false

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
    try {
      if (voted) {
        await unvoteProposal(id, user.id)
        setVoted(false)
      } else {
        await voteProposal(id, user.id)
        setVoted(true)
      }
      await refetch()
    } finally {
      setVoteLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user || !id) { navigate('/login'); return }
    if (saved) {
      await unsaveProposal(id, user.id)
      setSaved(false)
      setSavesCount(c => Math.max(0, c - 1))
    } else {
      await saveProposal(id, user.id)
      setSaved(true)
      setSavesCount(c => c + 1)
    }
  }

  // ── Comments ──────────────────────────────────────────────
  const [commentText, setCommentText] = useState('')
  const [commentAnon, setCommentAnon] = useState(true)
  const [commentLoading, setCommentLoading] = useState(false)

  const handleAddComment = async () => {
    if (!user || !id || !commentText.trim()) return
    setCommentLoading(true)
    try {
      await addComment(id, user.id, commentText.trim(), commentAnon)
      setCommentText('')
      await refetchComments()
    } finally {
      setCommentLoading(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId)
    refetchComments()
  }

  // ── Report ───────────────────────────────────────────────
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportDone, setReportDone] = useState(false)

  const handleReport = async () => {
    if (!user || !id) return
    setReportLoading(true)
    const { error } = await reportProposal(id, user.id, reportReason)
    setReportLoading(false)
    if (error?.includes('duplicate')) {
      setReportDone(true)
      setReportOpen(false)
      return
    }
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

  const handleDelete = async () => {
    if (!id) return
    setDeleteLoading(true)
    try {
      await deleteProposal(id)
      navigate('/home')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Admin: status change ─────────────────────────────────
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)

  const handleAdminStatus = async (newStatus: string) => {
    if (!id) return
    await adminUpdateStatus(id, newStatus)
    await refetch()
    setStatusMenuOpen(false)
  }

  // ── Admin: official reply modal ──────────────────────────
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [replySignedBy, setReplySignedBy] = useState('')
  const [replySaving, setReplySaving] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)

  const openReplyModal = () => {
    const existing = proposal?.official_replies?.[0]
    setReplyContent(existing?.content ?? '')
    setReplySignedBy(existing?.signed_by ?? profile?.name ?? '')
    setReplyError(null)
    setReplyOpen(true)
  }

  const saveReply = async () => {
    if (!replyContent.trim()) { setReplyError('답변 내용을 입력해주세요.'); return }
    if (!replySignedBy.trim()) { setReplyError('서명자를 입력해주세요.'); return }
    if (!id) return
    setReplySaving(true)
    const { error } = await upsertOfficialReply(id, replyContent.trim(), replySignedBy.trim())
    setReplySaving(false)
    if (error) { setReplyError('저장 중 오류가 발생했습니다.'); return }
    await refetch()
    setReplyOpen(false)
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
  const existingReply = proposal?.official_replies?.[0]

  const STATUS_LABELS: Record<string, string> = {
    active: '진행 중', selected: '선정됨', done: '반영 완료',
    rejected: '반려', blinded: '블라인드',
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
      <section className="px-4 sm:px-12 pt-8 sm:pt-10 pb-20 bg-bg">
        <div className="max-w-[1080px] mx-auto flex flex-col lg:grid lg:gap-8" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>

          {/* ── Main content ── */}
          <div>
            {loading && <div className="text-base text-ink-muted">불러오는 중…</div>}

            {/* Breadcrumb */}
            {(() => {
              const isActive  = proposal?.status === 'active'
              const isPopular = isActive && (proposal?.vote_count ?? 0) >= 20
              const [parentLabel, parentPath] =
                isPopular  ? ['인기 이슈',       '/home']     :
                isActive   ? ['전체 안건',        '/proposals']:
                             ['답변 · 아카이브', '/archive']
              return (
                <div className="text-xs text-ink-sub mb-4">
                  {isPopular ? (
                    <>
                      <span onClick={() => navigate('/home')} className="cursor-pointer">홈</span>
                      <span className="mx-1.5 text-ink-muted">/</span>
                      <span onClick={() => navigate('/home')} className="cursor-pointer">인기 이슈</span>
                    </>
                  ) : (
                    <span onClick={() => navigate(parentPath)} className="cursor-pointer">{parentLabel}</span>
                  )}
                  <span className="mx-1.5 text-ink-muted">/</span>
                  <span className="text-ink font-medium">안건 상세</span>
                </div>
              )
            })()}

            {/* Category selector or tags */}
            {editMode ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {CATS.map(c => (
                  <span
                    key={c}
                    onClick={() => setEditCat(c)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                    style={{
                      background: c === editCat ? COLORS.ink : COLORS.surface,
                      color: c === editCat ? '#fff' : COLORS.inkSub,
                      border: `1px solid ${c === editCat ? COLORS.ink : COLORS.line}`,
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3.5">
                <TagPill>{category}</TagPill>
                {voteCount >= 20 && proposal?.status === 'active' && (
                  <Badge tone="fire">🔥 인기 급상승</Badge>
                )}
                {proposal?.status && proposal.status !== 'active' && (
                  <Badge tone={
                    proposal.status === 'selected' ? 'brand' :
                    proposal.status === 'done' ? 'brandSoft' :
                    proposal.status === 'rejected' ? 'warn' : 'default'
                  }>
                    {STATUS_LABELS[proposal.status] ?? proposal.status}
                  </Badge>
                )}
                <span className="text-xs text-ink-muted">
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
                className="w-full font-extrabold font-sans text-ink bg-surface outline-none box-border mb-4 rounded-2.5 px-4 py-2.5"
                style={{
                  fontSize: 30, letterSpacing: '-0.03em',
                  border: `1.5px solid ${COLORS.brand}`,
                }}
              />
            ) : (
              <h1
                className="text-7xl sm:text-8xl font-extrabold m-0 text-ink"
                style={{ letterSpacing: '-0.03em', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'break-word' }}
              >
                {title}
              </h1>
            )}

            {/* Author meta */}
            {!editMode && (
              <div
                className="mt-5 py-3.5 border-t border-b border-line-soft flex items-center gap-4 text-ink-sub"
                style={{ fontSize: 12.5 }}
              >
                <div className="w-8 h-8 rounded-full bg-surface-alt grid place-items-center text-sm">🎭</div>
                <div>
                  <div className="text-sm font-semibold text-ink">
                    {proposal?.is_anonymous
                      ? `익명의 대신인 · ${proposal.profiles?.grade ?? '?'}학년`
                      : (proposal?.profiles?.grade ? `${proposal.profiles.grade}학년` : '작성자')}
                  </div>
                  {IS_ADMIN && proposal && (
                    <div className="text-xs text-warn mt-0.75 font-medium">
                      ⓘ 발의자: {proposal.profiles?.email ?? '(이메일 없음)'} (운영자에게만 표시)
                    </div>
                  )}
                </div>
                <div className="ml-auto flex gap-4.5 items-center text-xs">
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
                  className="w-full text-base text-ink font-sans bg-surface outline-none resize-y box-border mt-4 rounded-2.5 px-4 py-3.5"
                  style={{ lineHeight: 1.85, border: `1.5px solid ${COLORS.brand}` }}
                />
                {editError && <div className="text-xs text-warn mt-2">{editError}</div>}
                <div className="mt-3 flex gap-2.5 justify-end">
                  <Btn variant="outline" size="md" onClick={cancelEdit}>취소</Btn>
                  <Btn variant="brand" size="md" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? '저장 중…' : '수정 저장'}
                  </Btn>
                </div>
              </>
            ) : (
              <div
                className="text-lg text-ink mt-7"
                style={{ lineHeight: 1.85, letterSpacing: '-0.005em', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}
              >
                {body}
              </div>
            )}

            {/* Action buttons */}
            {!editMode && (
              <div className="mt-9 flex gap-3 items-center">
                <button
                  onClick={handleVote}
                  disabled={voteLoading || proposal?.status !== 'active'}
                  className="flex-1 h-14 rounded-3 flex items-center justify-center gap-2.5 text-lg font-bold font-sans"
                  style={{
                    border: `1.5px solid ${voted ? COLORS.inkSub : COLORS.brand}`,
                    background: voted ? COLORS.surface : COLORS.brand,
                    color: voted ? COLORS.ink : '#fff',
                    cursor: (voteLoading || proposal?.status !== 'active') ? 'not-allowed' : 'pointer',
                    letterSpacing: '-0.01em',
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
                  style={{ width: 100, background: saved ? COLORS.surfaceAlt : undefined }}
                  onClick={handleSave}
                >
                  저장{saved ? ' ✓' : ''}
                </Btn>
                {!isMyProposal && (
                  <Btn
                    variant="outline" size="lg"
                    style={{
                      width: 80,
                      color: reportDone ? COLORS.inkMuted : COLORS.warn,
                      borderColor: reportDone ? COLORS.line : '#F2D6C2',
                    }}
                    onClick={() => !reportDone && setReportOpen(true)}
                    disabled={reportDone}
                  >
                    {reportDone ? '신고 완료' : '신고'}
                  </Btn>
                )}
              </div>
            )}

            {/* ── Comments ── */}
            {!editMode && (
              <div className="mt-12">
                <div className="text-xl font-bold mb-5 flex items-center gap-2" style={{ letterSpacing: '-0.02em' }}>
                  의견
                  <span className="text-sm text-ink-muted font-medium">{commentCount}개</span>
                </div>

                {user && (
                  <div className="bg-surface border border-line rounded-3.5 p-4.5 mb-5">
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="의견을 남겨주세요…"
                      rows={3}
                      className="w-full border-none outline-none resize-none text-base text-ink font-sans bg-transparent box-border"
                      style={{ letterSpacing: '-0.01em', lineHeight: 1.65 }}
                    />
                    <div className="mt-3 flex justify-between items-center">
                      <label className="flex items-center gap-1.75 cursor-pointer text-xs text-ink-sub">
                        <div
                          onClick={() => setCommentAnon(!commentAnon)}
                          className="w-7.5 h-4 rounded-full relative cursor-pointer transition-colors"
                          style={{ background: commentAnon ? COLORS.ink : COLORS.line }}
                        >
                          <span
                            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                            style={{ left: commentAnon ? 15 : 2, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
                          />
                        </div>
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

                {comments.length === 0 ? (
                  <div className="py-8 text-center text-ink-muted text-sm">
                    아직 의견이 없습니다. 첫 번째 의견을 남겨보세요.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {comments.map(c => {
                      const isOwn = user?.id === c.author_id
                      const authorLabel = c.is_anonymous
                        ? `익명 · ${c.profiles?.grade ?? '?'}학년`
                        : (c.profiles?.name ?? '학생')
                      return (
                        <div key={c.id} className="px-4.5 py-4 bg-surface border border-line rounded-3">
                          <div className="flex justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6.5 h-6.5 rounded-full bg-surface-alt grid place-items-center text-xs">
                                {c.is_anonymous ? '🎭' : '👤'}
                              </div>
                              <span className="text-xs font-semibold text-ink">{authorLabel}</span>
                              <span className="text-xs text-ink-muted">{relativeTime(c.created_at)}</span>
                            </div>
                            {(isOwn || IS_ADMIN) && (
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="border-none bg-none cursor-pointer text-xs text-ink-muted px-1.5 py-0.5 font-sans"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                          <p
                            className="text-base text-ink m-0"
                            style={{ lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word' }}
                          >
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
          <aside className="flex flex-col gap-4 mt-8 lg:mt-0">

            {/* Vote progress */}
            <div className="bg-surface border border-line rounded-4 p-6">
              <div className="text-xs font-bold text-brand mb-3.5" style={{ letterSpacing: '0.14em' }}>
                VOTE PROGRESS
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-11xl font-extrabold leading-none text-ink"
                  style={{ letterSpacing: '-0.04em', fontFeatureSettings: '"tnum"' }}
                >
                  {voteCount}
                </span>
                <span className="text-xl text-ink-muted font-medium">/ 30표</span>
              </div>
              <div className="mt-3.5">
                <ProgressBar value={voteCount} max={30} height={10} />
              </div>
              {voteCount < 30 && proposal?.status === 'active' && (
                <div
                  className="mt-3.5 px-3 py-2.5 rounded-2 flex items-center gap-2 text-xs font-medium"
                  style={{ background: '#FFEFD9', color: '#7A4B0E' }}
                >
                  <span>🔥</span>
                  선정까지 단 <strong className="font-bold">{30 - voteCount}표</strong>! 친구에게 공유해보세요.
                </div>
              )}
              {(voteCount >= 30 || (proposal?.status && proposal.status !== 'active')) && (
                <div
                  className="mt-3.5 px-3 py-2.5 rounded-2 flex items-center gap-2 text-xs font-medium text-brand-dark"
                  style={{ background: COLORS.brandSoft }}
                >
                  <span>✓</span>
                  {proposal?.status === 'done' ? '반영 완료! 학교가 응답했습니다.' :
                   proposal?.status === 'rejected' ? '이 안건은 반려되었습니다.' :
                   '선정 완료! 학생회로 전달되었습니다.'}
                </div>
              )}
            </div>

            {/* My status */}
            <div className="bg-ink text-white rounded-4 p-5.5">
              <div className="text-xs font-bold mb-2.5" style={{ letterSpacing: '0.14em', color: 'rgba(255,255,255,0.55)' }}>
                내 상태
              </div>
              <div className="text-base" style={{ lineHeight: 1.7 }}>
                {isMyProposal
                  ? <><strong className="font-bold">내가 작성</strong>한 안건입니다.</>
                  : voted
                  ? <><strong className="font-bold">추천</strong>한 안건입니다.</>
                  : '아직 추천하지 않은 안건입니다.'}
              </div>
              {isMyProposal && (
                <>
                  <div
                    className="mt-3.5 px-3 py-2.5 rounded-2 text-xs"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}
                  >
                    {canEdit
                      ? '진행 중인 안건은 수정/삭제할 수 있습니다.'
                      : '선정된 안건은 수정/삭제할 수 없습니다.'}
                  </div>
                  <div className="mt-3.5 flex gap-2">
                    <button
                      disabled={!canEdit}
                      onClick={canEdit ? startEdit : undefined}
                      className="flex-1 h-9 rounded-2 border-none text-xs font-sans"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: canEdit ? '#fff' : 'rgba(255,255,255,0.4)',
                        cursor: canEdit ? 'pointer' : 'not-allowed',
                      }}
                    >
                      수정
                    </button>
                    <button
                      disabled={!canEdit}
                      onClick={canEdit ? () => setDeleteConfirm(true) : undefined}
                      className="flex-1 h-9 rounded-2 border-none text-xs font-sans"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: canEdit ? '#ff8a8a' : 'rgba(255,255,255,0.4)',
                        cursor: canEdit ? 'pointer' : 'not-allowed',
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
              <div className="bg-brand-soft border border-brand rounded-4 p-5.5">
                <div className="text-xs font-bold text-brand mb-3" style={{ letterSpacing: '0.14em' }}>
                  ⚙ 운영자 도구
                </div>
                <div className="flex flex-col gap-2">
                  <Btn variant="brand" size="sm" full onClick={openReplyModal}>
                    {existingReply ? '학생회 답변 수정' : '학생회 답변 작성'}
                  </Btn>
                  <div className="relative">
                    <Btn variant="outline" size="sm" full onClick={() => setStatusMenuOpen(o => !o)}>
                      상태 변경 ({STATUS_LABELS[proposal?.status ?? 'active'] ?? '?'}) ▾
                    </Btn>
                    {statusMenuOpen && (
                      <div
                        className="absolute top-full left-0 right-0 z-[99] bg-surface border border-line rounded-2.5 overflow-hidden mt-1"
                        style={{ boxShadow: '0 8px 24px -4px rgba(0,0,0,0.15)' }}
                      >
                        {[
                          { status: 'active',   label: '진행 중' },
                          { status: 'selected', label: '선정됨' },
                          { status: 'done',     label: '반영 완료' },
                          { status: 'rejected', label: '반려' },
                        ].map(({ status, label }) => (
                          <button
                            key={status}
                            onClick={() => handleAdminStatus(status)}
                            className="block w-full px-3.5 py-3 text-left border-none font-sans text-sm text-ink cursor-pointer"
                            style={{
                              background: proposal?.status === status ? COLORS.surfaceAlt : 'transparent',
                              fontWeight: proposal?.status === status ? 700 : 400,
                            }}
                          >
                            {label} {proposal?.status === status ? '✓' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Btn
                    variant="outline" size="sm" full
                    style={{ color: COLORS.warn, borderColor: '#F2D6C2' }}
                    onClick={() => handleAdminStatus('blinded')}
                  >
                    블라인드 처리
                  </Btn>
                </div>
              </div>
            )}

            {/* Activity stats */}
            <div className="bg-surface border border-line rounded-4 p-5.5">
              <div className="text-xs font-bold text-ink-sub mb-3.5" style={{ letterSpacing: '0.14em' }}>
                ACTIVITY
              </div>
              {[
                ['추천', `${voteCount}명`],
                ['조회', `${viewCount}회`],
                ['의견', `${commentCount}개`],
                ['저장', `${savesCount}명`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 text-sm border-t border-line-soft">
                  <span className="text-ink-sub">{k}</span>
                  <span className="text-ink font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Official reply */}
            {existingReply && (
              <div className="bg-surface border border-line rounded-4 p-5.5">
                <div className="text-2xs font-bold text-brand mb-2.5" style={{ letterSpacing: '0.14em' }}>
                  OFFICIAL REPLY
                </div>
                <p className="text-sm text-ink m-0" style={{ lineHeight: 1.65 }}>{existingReply.content}</p>
                <div className="text-xs text-ink-muted mt-2.5">— {existingReply.signed_by}</div>
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* ── Report modal ── */}
      {reportOpen && (
        <Modal title="이 안건을 신고하시겠습니까?" onClose={() => setReportOpen(false)}>
          <p className="text-sm text-ink-sub mt-0 mb-4" style={{ lineHeight: 1.6 }}>
            허위 사실, 욕설, 비방 등 커뮤니티 가이드라인에 위반되는 내용을 신고해 주세요.
          </p>
          <textarea
            value={reportReason}
            onChange={e => setReportReason(e.target.value)}
            placeholder="신고 사유를 입력해주세요 (선택)"
            rows={3}
            className="w-full border border-line rounded-2.5 px-3.5 py-3 text-sm font-sans text-ink bg-surface-alt outline-none resize-none box-border mb-4"
          />
          <div className="flex gap-2.5 justify-end">
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
          <p className="text-sm text-ink-sub mt-0 mb-5" style={{ lineHeight: 1.6 }}>
            삭제된 안건은 복구할 수 없습니다. 정말로 삭제하시겠습니까?
          </p>
          <div className="flex gap-2.5 justify-end">
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

      {/* ── Admin reply modal ── */}
      {replyOpen && (
        <Modal
          title={existingReply ? '학생회 답변 수정' : '학생회 공식 답변 작성'}
          onClose={() => setReplyOpen(false)}
        >
          <div className="mb-3">
            <div className="text-xs font-semibold text-ink mb-2">답변 내용</div>
            <textarea
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              placeholder="학생회 공식 입장을 작성해주세요…"
              rows={5}
              className="w-full border border-line rounded-2.5 px-3.5 py-3 text-sm font-sans text-ink bg-surface-alt outline-none resize-none box-border"
            />
          </div>
          <div className="mb-4">
            <div className="text-xs font-semibold text-ink mb-2">서명 (예: 대신고 학생회)</div>
            <input
              value={replySignedBy}
              onChange={e => setReplySignedBy(e.target.value)}
              placeholder="서명자 또는 부서명"
              className="w-full border border-line rounded-2.5 px-3.5 py-2.5 text-sm font-sans text-ink bg-surface-alt outline-none box-border"
            />
          </div>
          {replyError && <div className="text-xs text-warn mb-3">{replyError}</div>}
          <div className="flex gap-2.5 justify-end">
            <Btn variant="outline" size="md" onClick={() => setReplyOpen(false)}>취소</Btn>
            <Btn variant="brand" size="md" onClick={saveReply} disabled={replySaving}>
              {replySaving ? '저장 중…' : '저장하기'}
            </Btn>
          </div>
        </Modal>
      )}

      {statusMenuOpen && (
        <div className="fixed inset-0 z-[98]" onClick={() => setStatusMenuOpen(false)} />
      )}
    </AppLayout>
  )
}
