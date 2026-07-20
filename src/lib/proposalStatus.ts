import type { BadgeTone } from '../tokens/tokens'
import type { ProposalStatus } from '../types/database'

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  active: '추천 진행',
  selected: '학생회 전달',
  discussing: '협의 중',
  done: '반영 완료',
  rejected: '반려',
  blinded: '블라인드',
}

export const PROPOSAL_STATUS_TONES: Record<ProposalStatus, BadgeTone> = {
  active: 'outline',
  selected: 'brand',
  discussing: 'hold',
  done: 'brandSoft',
  rejected: 'warn',
  blinded: 'default',
}

export const SELECTED_PROPOSAL_STATUSES: ProposalStatus[] = [
  'selected',
  'discussing',
  'done',
  'rejected',
]

export function getProposalStatusLabel(status: ProposalStatus) {
  return PROPOSAL_STATUS_LABELS[status]
}

export function getProposalStatusTone(status: ProposalStatus) {
  return PROPOSAL_STATUS_TONES[status]
}
