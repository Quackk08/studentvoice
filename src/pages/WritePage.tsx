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
    const trimmedTitle = title.trim()
    const trimmedBody = body.trim()

    if (!user) { navigate('/login'); return }
    if (trimmedTitle.length < 5) { setErrorMsg('제목을 5자 이상 입력해주세요.'); return }
    if (trimmedBody.length < 50) { setErrorMsg('본문을 50자 이상 입력해주세요.'); return }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const { data, error } = await submitProposal({
        authorId: user.id,
        category: CATS[selectedCat] as ProposalCategory,
        title: trimmedTitle,
        body: trimmedBody,
        isAnonymous: anonymous,
      })
      if (error) { setErrorMsg(error); return }
      navigate(`/proposals/${data!.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppLayout active="write" isAdmin={profile?.is_admin ?? false}>
      <section className="responsive-section" style={{ padding: '56px 48px 80px', background: COLORS.bg }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: COLORS.brand,
              marginBottom: 14,
            }}
          >
            NEW PROPOSAL
          </div>
          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              margin: 0,
              letterSpacing: '-0.032em',
              lineHeight: 1.05,
            }}
          >
            학교에 제안할<br />의견을 작성해주세요.
          </h1>

          {/* Notice banner */}
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              gap: 14,
              padding: '16px 18px',
              background: '#FFF8E8',
              border: '1px solid #F2E6BD',
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 16, lineHeight: 1 }}>💡</div>
            <div style={{ fontSize: 12.5, color: '#6B5A12', lineHeight: 1.65 }}>
              <strong style={{ fontWeight: 700 }}>작성 전 확인해주세요.</strong>{' '}
              추천 30표 이상 모인 안건만 학생회로 전달됩니다. 비방·인신공격성 글은 게시 즉시
              블라인드 처리되며, 안건이 <strong style={{ fontWeight: 700 }}>진행 중</strong>인 동안만 수정·삭제할 수 있습니다.
            </div>
          </div>

          {/* Form card */}
          <div
            style={{
              marginTop: 24,
              background: COLORS.surface,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 16,
              padding: '36px 40px',
            }}
          >
            {/* Category */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.ink,
                  marginBottom: 10,
                }}
              >
                카테고리
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CATS.map((c, i) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setSelectedCat(i)}
                    aria-pressed={i === selectedCat}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 99,
                      fontSize: 13,
                      fontWeight: 500,
                      background: i === selectedCat ? COLORS.ink : COLORS.surface,
                      color: i === selectedCat ? '#fff' : COLORS.inkSub,
                      border: `1px solid ${i === selectedCat ? COLORS.ink : COLORS.line}`,
                      cursor: 'pointer',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>안건 제목</span>
                <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                  {title.length} / 60자
                </span>
              </div>
              <input
                value={title}
                onChange={e => {
                  setTitle(e.target.value)
                  if (errorMsg) setErrorMsg(null)
                }}
                maxLength={60}
                style={{
                  width: '100%',
                  height: 56,
                  padding: '0 18px',
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 10,
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  letterSpacing: '-0.02em',
                  color: COLORS.ink,
                  background: COLORS.surface,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {/* Body */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>본문</span>
                <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                  최소 50자 이상 · {body.length} / 2000자
                </span>
              </div>

              <textarea
                value={body}
                onChange={e => {
                  setBody(e.target.value)
                  if (errorMsg) setErrorMsg(null)
                }}
                maxLength={2000}
                style={{
                  width: '100%',
                  minHeight: 220,
                  padding: '16px 18px',
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 10,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  color: COLORS.ink,
                  lineHeight: 1.7,
                  letterSpacing: '-0.01em',
                  outline: 'none',
                  background: COLORS.surface,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Bottom row */}
            <div
              className="write-bottom"
              style={{
                marginTop: 28,
                paddingTop: 24,
                borderTop: `1px solid ${COLORS.lineSoft}`,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12.5,
                  color: COLORS.inkSub,
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)} />
                익명으로 게시 (작성자 이메일은 운영진만 확인할 수 있습니다)
              </label>

              {errorMsg && (
                <div role="alert" style={{ fontSize: 12, color: COLORS.warn, marginRight: 'auto', maxWidth: 320 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <Btn variant="outline" size="md" onClick={() => navigate('/home')}>
                  취소
                </Btn>
                <Btn
                  variant="brand"
                  size="md"
                  onClick={handleSubmit}
                  disabled={submitting}
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
