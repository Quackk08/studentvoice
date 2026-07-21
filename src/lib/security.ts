import type { ProposalCategory, ProposalStatus } from '../types/database'

export const PROPOSAL_CATEGORIES = ['#시설', '#급식', '#교칙', '#학사', '#수업', '#복지', '#기타'] as const
export const PROPOSAL_STATUSES: ProposalStatus[] = ['active', 'selected', 'discussing', 'done', 'rejected', 'blinded']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[A-Z0-9._%+-]+@dshs\.kr$/i

// replace()와 test()가 RegExp.lastIndex를 공유하지 않도록 별도 정규식을 사용한다.
const CONTROL_CHARS_REPLACE_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
const CONTROL_CHARS_TEST_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/

export function normalizeText(value: string, maxLength: number) {
  return value.replace(CONTROL_CHARS_REPLACE_RE, '').trim().slice(0, maxLength)
}

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isSchoolEmail(value: string) {
  return EMAIL_RE.test(value.trim())
}

export function isProposalCategory(value: string): value is ProposalCategory {
  return PROPOSAL_CATEGORIES.includes(value as ProposalCategory) && !CONTROL_CHARS_TEST_RE.test(value)
}

export function isProposalStatus(value: string): value is ProposalStatus {
  return PROPOSAL_STATUSES.includes(value as ProposalStatus)
}

export function validateProposalInput(params: { category: string; title: string; body: string }) {
  const title = normalizeText(params.title, 60)
  const body = normalizeText(params.body, 2000)

  if (!isProposalCategory(params.category)) return { error: '허용되지 않은 카테고리입니다.' }
  if (title.length < 5) return { error: '제목을 5자 이상 입력해주세요.' }
  if (body.length < 50) return { error: '본문을 50자 이상 입력해주세요.' }

  return {
    value: {
      category: params.category as ProposalCategory,
      title,
      body,
    },
  }
}

export function validateCommentInput(content: string) {
  const value = normalizeText(content, 500)
  if (value.length < 1) return { error: '댓글 내용을 입력해주세요.' }
  return { value }
}

export function validateReportReason(reason: string) {
  return normalizeText(reason, 300)
}

export function validateOfficialReply(params: { content: string; signedBy: string }) {
  const content = params.content.replace(CONTROL_CHARS_REPLACE_RE, '').trim()
  const signedBy = params.signedBy.replace(CONTROL_CHARS_REPLACE_RE, '').trim()

  if (content.length < 3) return { error: '공식 답변 내용을 3자 이상 입력해주세요.' }
  if (content.length > 1200) return { error: '공식 답변은 1200자 이하로 입력해주세요.' }
  if (signedBy.length < 2) return { error: '공개 답변자를 2자 이상 입력해주세요.' }
  if (signedBy.length > 40) return { error: '공개 답변자는 40자 이하로 입력해주세요.' }

  return { value: { content, signedBy } }
}

export function validatePassword(value: string) {
  if (value.length < 8) return '비밀번호는 8자 이상으로 설정해주세요.'
  if (value.length > 128) return '비밀번호는 128자 이하로 입력해주세요.'
  return null
}
