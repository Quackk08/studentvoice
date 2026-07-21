import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { announceDataChanged } from './useProposals'
import type { AccountRole, AdminMember, AdminMemberSummary } from '../types/database'

type ApiError = { code?: string; message?: string } | null

const DATA_CHANGED_EVENT = 'studentvoice:data-changed'
const EMPTY_SUMMARY: AdminMemberSummary = {
  total: 0,
  students: 0,
  admins: 0,
  teachers: 0,
  parents: 0,
  emailUnverified: 0,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
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

function normalizeRole(value: unknown, isAdmin: boolean): AccountRole {
  if (value === 'student' || value === 'admin' || value === 'teacher' || value === 'parent') return value
  return isAdmin ? 'admin' : 'student'
}

function normalizeMember(value: unknown): AdminMember {
  const row = asRecord(value)
  const isAdmin = Boolean(row.is_admin)
  return {
    id: asString(row.id),
    email: asString(row.email),
    name: asNullableString(row.name),
    grade: row.grade == null ? null : asNumber(row.grade),
    class: row.class == null ? null : asNumber(row.class),
    accountRole: normalizeRole(row.account_role, isAdmin),
    isAdmin,
    agreedToGuidelines: Boolean(row.agreed_to_guidelines),
    createdAt: asString(row.created_at),
    emailConfirmedAt: asNullableString(row.email_confirmed_at),
    lastSignInAt: asNullableString(row.last_sign_in_at),
    roleUpdatedAt: asNullableString(row.role_updated_at),
    roleUpdatedBy: asNullableString(row.role_updated_by),
    proposalCount: asNumber(row.proposal_count),
    commentCount: asNumber(row.comment_count),
    voteCount: asNumber(row.vote_count),
    reportCount: asNumber(row.report_count),
  }
}

function normalizeSummary(value: unknown): AdminMemberSummary {
  const row = asRecord(value)
  return {
    total: asNumber(row.total),
    students: asNumber(row.students),
    admins: asNumber(row.admins),
    teachers: asNumber(row.teachers),
    parents: asNumber(row.parents),
    emailUnverified: asNumber(row.email_unverified),
  }
}

function summarizeLegacyMembers(members: AdminMember[]): AdminMemberSummary {
  return members.reduce<AdminMemberSummary>((summary, member) => {
    summary.total += 1
    if (member.accountRole === 'admin') summary.admins += 1
    else summary.students += 1
    return summary
  }, { ...EMPTY_SUMMARY })
}

async function fetchLegacyMembers(search: string, role: AccountRole | 'all') {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, grade, class, is_admin, agreed_to_guidelines, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  const needle = search.trim().toLowerCase()
  return ((data ?? []) as unknown[])
    .map(normalizeMember)
    .filter(member => role === 'all' || member.accountRole === role)
    .filter(member => !needle || member.email.toLowerCase().includes(needle) || member.name?.toLowerCase().includes(needle))
}

async function fetchMemberDirectory(search: string, role: AccountRole | 'all') {
  const [membersResult, summaryResult] = await Promise.all([
    supabase.rpc('get_admin_members', {
      p_search: search.trim() || null,
      p_role: role === 'all' ? null : role,
      p_limit: 100,
      p_cursor_created_at: null,
      p_cursor_id: null,
    }),
    supabase.rpc('get_admin_member_summary'),
  ])

  const missingMembers = isMissingRpc(membersResult.error, 'get_admin_members')
  const missingSummary = isMissingRpc(summaryResult.error, 'get_admin_member_summary')
  if (missingMembers || missingSummary) {
    const allMembers = await fetchLegacyMembers('', 'all')
    const needle = search.trim().toLowerCase()
    return {
      available: false,
      members: allMembers
        .filter(member => role === 'all' || member.accountRole === role)
        .filter(member => !needle || member.email.toLowerCase().includes(needle) || member.name?.toLowerCase().includes(needle)),
      summary: summarizeLegacyMembers(allMembers),
    }
  }
  if (membersResult.error) throw new Error(membersResult.error.message)
  if (summaryResult.error) throw new Error(summaryResult.error.message)

  return {
    available: true,
    members: ((membersResult.data ?? []) as unknown[]).map(normalizeMember),
    summary: summaryResult.data?.[0] ? normalizeSummary(summaryResult.data[0]) : EMPTY_SUMMARY,
  }
}

export function useAdminMembers(params: {
  enabled: boolean
  search: string
  role: AccountRole | 'all'
}) {
  const [members, setMembers] = useState<AdminMember[]>([])
  const [summary, setSummary] = useState<AdminMemberSummary>(EMPTY_SUMMARY)
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!params.enabled) return
    setLoading(true)
    try {
      const result = await fetchMemberDirectory(params.search, params.role)
      setMembers(result.members)
      setSummary(result.summary)
      setAvailable(result.available)
      setError(null)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '가입자 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [params.enabled, params.role, params.search])

  useEffect(() => {
    if (!params.enabled) return
    setLoading(true)
    const initialId = window.setTimeout(refetch, 220)
    const intervalId = window.setInterval(refetch, 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible') refetch() }
    window.addEventListener(DATA_CHANGED_EVENT, refetch)
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(initialId)
      window.clearInterval(intervalId)
      window.removeEventListener(DATA_CHANGED_EVENT, refetch)
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [params.enabled, refetch])

  return { members, summary, available, loading, error, refetch }
}

export async function updateAdminMemberRole(params: {
  memberId: string
  newRole: AccountRole
  reason: string
}) {
  const reason = params.reason.trim()
  if (reason.length < 3) return { error: '역할 변경 사유를 3자 이상 입력해주세요.' }

  const { error } = await supabase.rpc('update_admin_member_role', {
    p_member_id: params.memberId,
    p_new_role: params.newRole,
    p_reason: reason,
  })
  if (isMissingRpc(error, 'update_admin_member_role')) {
    return { error: '역할 변경 DB 적용이 필요합니다. 현재 호환 모드에서는 가입자 조회만 가능합니다.' }
  }
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}
