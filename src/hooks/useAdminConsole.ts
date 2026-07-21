import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  adminDeleteProposal,
  adminUpdateStatus,
  announceDataChanged,
  dismissReport,
} from './useProposals'
import type {
  AdminActivityItem,
  AdminDashboardStats,
  AdminModerationAction,
  AdminProposal,
  AdminReportItem,
  AdminReportReason,
  ModerationStatus,
  ProposalCategory,
  ProposalStatus,
} from '../types/database'

type ApiError = { code?: string; message?: string } | null

const LEGACY_ADMIN_SELECT = '*, author_profile:profiles!proposals_author_id_fkey(id, name, email, grade, class), official_replies(*)'
const DATA_CHANGED_EVENT = 'studentvoice:data-changed'

const EMPTY_STATS: AdminDashboardStats = {
  profiles: 0,
  active: 0,
  nearThreshold: 0,
  selected: 0,
  discussing: 0,
  doneThisMonth: 0,
  reportedProposals: 0,
  totalReports: 0,
  blinded: 0,
  trashed: 0,
  lastActivityAt: null,
  schemaVersion: 'unknown',
}

function isMissingRpc(error: ApiError, rpcName: string) {
  if (!error) return false
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return detail.includes('pgrst202')
    || (detail.includes(rpcName.toLowerCase()) && (
      detail.includes('schema cache')
      || detail.includes('could not find')
      || detail.includes('not exist')
    ))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeAdminProposal(value: unknown): AdminProposal {
  const row = asRecord(value) ?? {}
  const profileValue = Array.isArray(row.author_profile) ? row.author_profile[0] : row.author_profile
  const profile = asRecord(profileValue)
  const replies = Array.isArray(row.official_replies)
    ? row.official_replies
    : row.official_replies && typeof row.official_replies === 'object'
      ? [row.official_replies]
      : []
  const firstReply = asRecord(replies[0])
  const status = asString(row.status, 'active') as ProposalStatus
  const moderation = asString(
    row.moderation_status,
    status === 'blinded' ? 'blinded' : 'visible',
  ) as ModerationStatus

  return {
    id: asString(row.id),
    author_id: asNullableString(row.author_id),
    category: asString(row.category, '#기타') as ProposalCategory,
    title: asString(row.title),
    body: asString(row.body),
    is_anonymous: Boolean(row.is_anonymous),
    status,
    vote_count: asNumber(row.vote_count),
    view_count: asNumber(row.view_count),
    comment_count: asNumber(row.comment_count),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at, asString(row.created_at)),
    author_name: asNullableString(row.author_name) ?? asNullableString(profile?.name),
    author_email: asNullableString(row.author_email) ?? asNullableString(profile?.email),
    author_grade: row.author_grade == null ? (profile?.grade == null ? null : asNumber(profile.grade)) : asNumber(row.author_grade),
    author_class: row.author_class == null ? (profile?.class == null ? null : asNumber(profile.class)) : asNumber(row.author_class),
    official_replies: replies as AdminProposal['official_replies'],
    moderation_status: moderation,
    moderation_reason: asNullableString(row.moderation_reason),
    report_count: asNumber(row.report_count),
    official_reply_content: asNullableString(row.official_reply_content) ?? asNullableString(firstReply?.content),
    official_reply_signed_by: asNullableString(row.official_reply_signed_by) ?? asNullableString(firstReply?.signed_by),
    latest_public_message: asNullableString(row.latest_public_message),
    latest_internal_note: asNullableString(row.latest_internal_note),
  }
}

async function fetchLegacyProposals() {
  const { data, error } = await supabase
    .from('proposals')
    .select(LEGACY_ADMIN_SELECT)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  return (data ?? []).map(normalizeAdminProposal)
}

async function fetchDashboard(): Promise<AdminDashboardStats> {
  const { data, error } = await supabase.rpc('get_admin_dashboard')
  if (!error && data?.[0]) {
    const row = data[0]
    return {
      profiles: asNumber(row.profiles),
      active: asNumber(row.active),
      nearThreshold: asNumber(row.near_threshold),
      selected: asNumber(row.selected),
      discussing: asNumber(row.discussing),
      doneThisMonth: asNumber(row.done_this_month),
      reportedProposals: asNumber(row.reported_proposals),
      totalReports: asNumber(row.total_reports),
      blinded: asNumber(row.blinded),
      trashed: asNumber(row.trashed),
      lastActivityAt: asNullableString(row.last_activity_at),
      schemaVersion: asString(row.schema_version, 'admin-console-v2'),
    }
  }
  if (!isMissingRpc(error, 'get_admin_dashboard')) throw new Error(error?.message ?? '관리자 통계를 불러오지 못했습니다.')

  const [proposals, publicStats, reported] = await Promise.all([
    fetchLegacyProposals(),
    supabase.rpc('get_public_home_stats'),
    supabase.rpc('get_reported_proposals'),
  ])
  const now = new Date()
  const reportedRows = (reported.error ? [] : (reported.data ?? [])) as Record<string, unknown>[]

  return {
    ...EMPTY_STATS,
    profiles: asNumber(publicStats.data?.[0]?.profiles),
    active: proposals.filter(item => item.status === 'active').length,
    nearThreshold: proposals.filter(item => item.status === 'active' && item.vote_count >= 20 && item.vote_count < 30).length,
    selected: proposals.filter(item => item.status === 'selected').length,
    discussing: proposals.filter(item => item.status === 'discussing').length,
    doneThisMonth: proposals.filter(item => {
      if (item.status !== 'done') return false
      const updated = new Date(item.updated_at)
      return updated.getFullYear() === now.getFullYear() && updated.getMonth() === now.getMonth()
    }).length,
    reportedProposals: reportedRows.length,
    totalReports: reportedRows.reduce((total, row) => total + asNumber(row.report_count), 0),
    blinded: proposals.filter(item => item.moderation_status === 'blinded').length,
    trashed: proposals.filter(item => item.moderation_status === 'trashed').length,
    schemaVersion: 'legacy-compatible',
  }
}

async function fetchProposals(): Promise<AdminProposal[]> {
  const { data, error } = await supabase.rpc('get_admin_proposals', {
    p_scope: 'all',
    p_search: null,
    p_category: null,
    p_limit: 100,
    p_cursor_updated_at: null,
    p_cursor_id: null,
  })
  if (!error) return (data ?? []).map(normalizeAdminProposal)
  if (!isMissingRpc(error, 'get_admin_proposals')) throw new Error(error.message)
  return fetchLegacyProposals()
}

function normalizeReasons(value: unknown): AdminReportReason[] {
  if (!Array.isArray(value)) return []
  return value.map(item => {
    const row = asRecord(item) ?? {}
    return {
      id: asNullableString(row.id),
      reason: asString(row.reason, '사유 미입력'),
      created_at: asNullableString(row.created_at),
    }
  })
}

async function fetchReports(): Promise<AdminReportItem[]> {
  const { data, error } = await supabase.rpc('get_admin_report_queue', {
    p_limit: 100,
    p_cursor_latest_at: null,
    p_cursor_proposal_id: null,
  })
  if (!error) {
    return ((data ?? []) as unknown[]).map(value => {
      const row = asRecord(value) ?? {}
      return {
        proposal: normalizeAdminProposal({ ...row, id: row.proposal_id, report_count: row.report_count }),
        reportCount: asNumber(row.report_count),
        latestAt: asString(row.latest_at),
        reasons: normalizeReasons(row.reasons),
      }
    })
  }
  if (!isMissingRpc(error, 'get_admin_report_queue')) throw new Error(error.message)

  const [{ data: reports, error: reportError }, proposals] = await Promise.all([
    supabase.rpc('get_reported_proposals'),
    fetchLegacyProposals(),
  ])
  if (reportError) throw new Error(reportError.message)
  const proposalMap = new Map(proposals.map(item => [item.id, item]))

  return ((reports ?? []) as unknown[]).flatMap(value => {
    const row = asRecord(value) ?? {}
    const proposalId = asString(row.proposal_id)
    const proposal = proposalMap.get(proposalId)
    if (!proposal) return []
    const latestAt = asString(row.latest_at, proposal.updated_at)
    return [{
      proposal: { ...proposal, report_count: asNumber(row.report_count) },
      reportCount: asNumber(row.report_count),
      latestAt,
      reasons: [{ id: null, reason: asString(row.latest_reason, '사유 미입력'), created_at: latestAt }],
    }]
  })
}

async function fetchActivity(): Promise<{ data: AdminActivityItem[]; available: boolean }> {
  const { data, error } = await supabase.rpc('get_admin_activity', {
    p_limit: 50,
    p_cursor_created_at: null,
    p_cursor_id: null,
  })
  if (isMissingRpc(error, 'get_admin_activity')) return { data: [], available: false }
  if (error) throw new Error(error.message)

  return {
    available: true,
    data: ((data ?? []) as unknown[]).map(value => {
      const row = asRecord(value) ?? {}
      return {
        id: asString(row.id),
        adminId: asNullableString(row.admin_id),
        adminName: asNullableString(row.admin_name),
        adminEmail: asNullableString(row.admin_email),
        proposalId: asNullableString(row.proposal_id),
        proposalTitle: asNullableString(row.proposal_title),
        action: asString(row.action),
        details: asRecord(row.details) ?? {},
        createdAt: asString(row.created_at),
      }
    }),
  }
}

export function useAdminConsole() {
  const [stats, setStats] = useState<AdminDashboardStats>(EMPTY_STATS)
  const [proposals, setProposals] = useState<AdminProposal[]>([])
  const [reports, setReports] = useState<AdminReportItem[]>([])
  const [activity, setActivity] = useState<AdminActivityItem[]>([])
  const [activityAvailable, setActivityAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      fetchDashboard(),
      fetchProposals(),
      fetchReports(),
      fetchActivity(),
    ])
    const messages: string[] = []

    if (results[0].status === 'fulfilled') setStats(results[0].value)
    else messages.push(`통계: ${results[0].reason instanceof Error ? results[0].reason.message : '조회 실패'}`)

    if (results[1].status === 'fulfilled') setProposals(results[1].value)
    else messages.push(`안건: ${results[1].reason instanceof Error ? results[1].reason.message : '조회 실패'}`)

    if (results[2].status === 'fulfilled') setReports(results[2].value)
    else messages.push(`신고: ${results[2].reason instanceof Error ? results[2].reason.message : '조회 실패'}`)

    if (results[3].status === 'fulfilled') {
      setActivity(results[3].value.data)
      setActivityAvailable(results[3].value.available)
    } else {
      messages.push(`운영 기록: ${results[3].reason instanceof Error ? results[3].reason.message : '조회 실패'}`)
    }

    setError(messages.length ? messages.join(' / ') : null)
    setRefreshedAt(new Date().toISOString())
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    const onVisible = () => { if (document.visibilityState === 'visible') refetch() }
    const intervalId = window.setInterval(refetch, 30_000)
    window.addEventListener(DATA_CHANGED_EVENT, refetch)
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener(DATA_CHANGED_EVENT, refetch)
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refetch])

  return {
    stats,
    proposals,
    reports,
    activity,
    activityAvailable,
    loading,
    error,
    refreshedAt,
    refetch,
  }
}

export async function transitionAdminProposal(params: {
  proposalId: string
  newStatus: Exclude<ProposalStatus, 'blinded'>
  publicMessage?: string
  internalNote?: string
}) {
  const { error } = await supabase.rpc('transition_proposal_status', {
    p_proposal_id: params.proposalId,
    p_new_status: params.newStatus,
    p_public_message: params.publicMessage?.trim() || null,
    p_internal_note: params.internalNote?.trim() || null,
  })
  if (isMissingRpc(error, 'transition_proposal_status')) {
    return adminUpdateStatus(params.proposalId, params.newStatus)
  }
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function moderateAdminProposal(params: {
  proposalId: string
  action: AdminModerationAction
  reason: string
}) {
  const reason = params.reason.trim()
  if (reason.length < 3) return { error: '처리 사유를 3자 이상 입력해주세요.' }

  const { error } = await supabase.rpc('moderate_proposal', {
    p_proposal_id: params.proposalId,
    p_action: params.action,
    p_reason: reason,
  })
  if (isMissingRpc(error, 'moderate_proposal')) {
    if (params.action === 'delete') return adminDeleteProposal(params.proposalId)
    const nextStatus = params.action === 'blind' || params.action === 'trash' ? 'blinded' : 'active'
    return adminUpdateStatus(params.proposalId, nextStatus)
  }
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function resolveAdminReports(proposalId: string, reason: string) {
  const trimmed = reason.trim()
  if (trimmed.length < 3) return { error: '처리 사유를 3자 이상 입력해주세요.' }
  const { error } = await supabase.rpc('resolve_proposal_reports', {
    p_proposal_id: proposalId,
    p_reason: trimmed,
  })
  if (isMissingRpc(error, 'resolve_proposal_reports')) return dismissReport(proposalId)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function publishAdminOfficialReply(params: {
  proposalId: string
  content: string
  signedBy: string
  newStatus: 'active' | 'discussing' | 'done' | 'rejected'
  publicMessage: string
  internalNote?: string
}) {
  const { error } = await supabase.rpc('publish_official_reply_as_admin', {
    p_proposal_id: params.proposalId,
    p_content: params.content.trim(),
    p_signed_by: params.signedBy.trim(),
    p_new_status: params.newStatus,
    p_public_message: params.publicMessage.trim(),
    p_internal_note: params.internalNote?.trim() || null,
  })
  if (isMissingRpc(error, 'publish_official_reply_as_admin')) {
    return { error: '공식 답변 워크플로우 DB 마이그레이션을 먼저 적용해주세요.' }
  }
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}
