import { useState } from 'react'
import { useNavigate } from 'react-router'
import AppLayout from '../components/shared/AppLayout'
import Btn from '../components/shared/Btn'
import { useAuth } from '../contexts/AuthContext'
import { submitProposal } from '../hooks/useProposals'
import { COLORS } from '../tokens/tokens'
import type { ProposalCategory } from '../types/database'

const CATS = ['#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타']

export default function WritePage() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [selectedCat, setSelectedCat] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [anonymous, setAnonymous] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!user) { navigate('/login'); return }
    if (title.length < 5) { setErrorMsg('제목을 5자 이상 입력해주세요.'); return }
    if (body.length < 50) { setErrorMsg('본문을 50자 이상 입력해주세요.'); return }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const { data, error } = await submitProposal({
        authorId: user.id,
        category: CATS[selectedCat] as ProposalCategory,
        title,
        body,
        isAnonymous: anonymous,
      })
      if (error) { setErrorMsg('제출 중 오류가 발생했습니다. 다시 시도해주세요.'); return }
      navigate(`/proposals/${data!.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppLayout active="write" isAdmin={profile?.is_admin ?? false}>
      <section className="px-4 lg:px-12 pt-10 lg:pt-14 pb-20 bg-bg">
        <div className="max-w-[880px] mx-auto">
          <div className="text-xs font-bold text-brand mb-3.5" style={{ letterSpacing: '0.18em' }}>
            NEW PROPOSAL
          </div>
          <h1 className="text-8xl sm:text-10xl font-extrabold m-0" style={{ letterSpacing: '-0.032em', lineHeight: 1.05 }}>
            학교에 제안할<br />의견을 작성해주세요.
          </h1>

          {/* Notice banner */}
          <div
            className="mt-7 flex gap-3.5 rounded-3 p-4"
            style={{ background: '#FFF8E8', border: '1px solid #F2E6BD' }}
          >
            <div className="text-xl leading-none">💡</div>
            <div className="text-sm" style={{ color: '#6B5A12', lineHeight: 1.65 }}>
              <strong className="font-bold">작성 전 확인해주세요.</strong>{' '}
              추천 30표 이상 모인 안건만 학생회로 전달됩니다. 비방·인신공격성 글은 게시 즉시
              블라인드 처리되며, 안건이 <strong className="font-bold">진행 중</strong>인 동안만 수정·삭제할 수 있습니다.
            </div>
          </div>

          {/* Form card */}
          <div className="mt-6 bg-surface border border-line rounded-4 px-6 lg:px-10 py-8 sm:py-9">
            {/* Category */}
            <div className="mb-7">
              <div className="text-xs font-semibold text-ink mb-2.5">카테고리</div>
              <div className="flex flex-wrap gap-2">
                {CATS.map((c, i) => (
                  <span
                    key={c}
                    onClick={() => setSelectedCat(i)}
                    className="px-3.5 py-2 rounded-full text-sm font-medium cursor-pointer"
                    style={{
                      background: i === selectedCat ? COLORS.ink : COLORS.surface,
                      color: i === selectedCat ? '#fff' : COLORS.inkSub,
                      border: `1px solid ${i === selectedCat ? COLORS.ink : COLORS.line}`,
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="mb-6">
              <div className="flex justify-between mb-2.5">
                <span className="text-xs font-semibold text-ink">안건 제목</span>
                <span className="text-xs text-ink-muted">{title.length} / 60자</span>
              </div>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={60}
                className="w-full h-14 px-4.5 border border-line rounded-2.5 text-3xl font-semibold font-sans text-ink bg-surface outline-none box-border"
                style={{ letterSpacing: '-0.02em' }}
              />
            </div>

            {/* Body */}
            <div>
              <div className="flex justify-between mb-2.5">
                <span className="text-xs font-semibold text-ink">본문</span>
                <span className="text-xs text-ink-muted">최소 50자 이상 · {body.length} / 2000자</span>
              </div>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                maxLength={2000}
                className="w-full px-4.5 py-4 border border-line rounded-2.5 text-base font-sans text-ink bg-surface outline-none box-border resize-y"
                style={{ minHeight: 220, lineHeight: 1.7, letterSpacing: '-0.01em' }}
              />
            </div>

            {/* Bottom row */}
            <div
              className="mt-7 pt-6 border-t border-line-soft flex flex-col lg:flex-row lg:items-center gap-4"
            >
              <label
                onClick={() => setAnonymous(!anonymous)}
                className="flex items-center gap-2 text-sm text-ink-sub cursor-pointer"
              >
                <span
                  className="w-4.5 h-4.5 rounded-1.25 grid place-items-center text-white text-xs font-bold flex-shrink-0"
                  style={{
                    background: anonymous ? COLORS.brand : COLORS.surface,
                    border: `1px solid ${anonymous ? COLORS.brand : COLORS.line}`,
                  }}
                >
                  {anonymous ? '✓' : ''}
                </span>
                익명으로 게시 (학번은 운영진만 확인 가능합니다)
              </label>

              {errorMsg && (
                <div className="text-xs text-warn lg:mr-auto lg:max-w-xs">{errorMsg}</div>
              )}
              <div className="lg:ml-auto flex gap-2.5">
                <Btn variant="outline" size="md" onClick={() => navigate('/home')}>
                  취소
                </Btn>
                <Btn
                  variant="brand"
                  size="md"
                  onClick={handleSubmit}
                  disabled={title.length < 5 || body.length < 50 || submitting}
                  style={{ opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? '제출 중...' : '작성 완료'}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  )
}
