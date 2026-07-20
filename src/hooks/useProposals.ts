import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  isProposalStatus,
  isUuid,
  validateCommentInput,
  validateOfficialReply,
  validateProposalInput,
  validateReportReason,
} from '../lib/security'
import type {
  Proposal,
  ProposalCategory,
  Comment,
  NotificationSettings,
  Notification,
} from '../types/database'
import { SELECTED_PROPOSAL_STATUSES } from '../lib/proposalStatus'

export type UserNotificationKind = Notification['kind']

export interface UserNotification {
  id: string
  proposalId: string | null
  title: string
  message: string
  kind: UserNotificationKind
  createdAt: string
  href: string
  readAt: string | null
}

const DATA_CHANGED_EVENT = 'studentvoice:data-changed'
const LEGACY_PROPOSAL_SELECT = '*, profiles(id, name, email, grade, class), official_replies(*)'

type ProposalQueryResult = {
  data: unknown
  error: { code?: string; message?: string } | null
  count?: number | null
}

function isMissingProposalFeed(error: ProposalQueryResult['error']) {
  if (!error) return false
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return detail.includes('pgrst205')
    || detail.includes('42p01')
    || (detail.includes('proposal_feed') && (
      detail.includes('schema cache')
      || detail.includes('not find')
      || detail.includes('not exist')
    ))
}

function isMissingCreateProposalRpc(error: ProposalQueryResult['error']) {
  if (!error) return false
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return detail.includes('pgrst202')
    || (detail.includes('create_proposal') && (
      detail.includes('schema cache')
      || detail.includes('could not find')
      || detail.includes('not exist')
    ))
}

function normalizeProposalRow(row: Record<string, unknown>): Proposal {
  const relatedProfile = Array.isArray(row.profiles)
    ? row.profiles[0] as Record<string, unknown> | undefined
    : row.profiles as Record<string, unknown> | null | undefined

  return {
    ...row,
    author_name: row.author_name ?? relatedProfile?.name ?? null,
    author_grade: row.author_grade ?? relatedProfile?.grade ?? null,
    author_class: row.author_class ?? relatedProfile?.class ?? null,
    author_email: row.author_email ?? relatedProfile?.email ?? null,
    official_replies: row.official_replies ?? [],
  } as Proposal
}

function normalizeProposalPayload(data: unknown) {
  if (Array.isArray(data)) return data.map(row => normalizeProposalRow(row as Record<string, unknown>))
  if (data && typeof data === 'object') return normalizeProposalRow(data as Record<string, unknown>)
  return data
}

async function queryProposalSource(
  build: (source: 'proposal_feed' | 'proposals', columns: string) => PromiseLike<ProposalQueryResult>,
  legacyColumns = LEGACY_PROPOSAL_SELECT,
) {
  let result = await build('proposal_feed', '*')
  if (isMissingProposalFeed(result.error)) {
    result = await build('proposals', legacyColumns)
  }
  return { ...result, data: normalizeProposalPayload(result.data) }
}

export function announceDataChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED_EVENT))
}

function subscribeToDataChanges(callback: () => void) {
  const onVisibilityChange = () => { if (document.visibilityState === 'visible') callback() }
  const intervalId = window.setInterval(callback, 30_000)
  window.addEventListener(DATA_CHANGED_EVENT, callback)
  window.addEventListener('focus', callback)
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    window.clearInterval(intervalId)
    window.removeEventListener(DATA_CHANGED_EVENT, callback)
    window.removeEventListener('focus', callback)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

export function useNoticeStats() {
  const [stats, setStats] = useState({
    deliveredThisMonth: 0,
    latestDeliveredAt: null as string | null,
  })
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const { data } = await supabase.rpc('get_notice_stats')
    const row = data?.[0]

    setStats({
      deliveredThisMonth: Number(row?.delivered_this_month ?? 0),
      latestDeliveredAt: row?.latest_delivered_at ?? null,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  return { stats, loading }
}

// ── Home / landing stats (profiles + proposal counts) ──────
export function useHomeStats() {
  const [stats, setStats] = useState({
    profiles: 0,
    active: 0,
    selected: 0,
    doneThisMonth: 0,
  })
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { data, error } = await supabase.rpc('get_public_home_stats')
    if (!error && data?.[0]) {
      setStats({
        profiles: Number(data[0].profiles ?? 0),
        active: Number(data[0].active ?? 0),
        selected: Number(data[0].selected ?? 0),
        doneThisMonth: Number(data[0].done_this_month ?? 0),
      })
      setLoading(false)
      return
    }

    const [a, s, d] = await Promise.all([
      queryProposalSource((source, columns) => supabase.from(source).select(columns, { count: 'exact', head: true }).eq('status', 'active'), 'id'),
      queryProposalSource((source, columns) => supabase.from(source).select(columns, { count: 'exact', head: true }).in('status', SELECTED_PROPOSAL_STATUSES), 'id'),
      queryProposalSource((source, columns) => supabase.from(source).select(columns, { count: 'exact', head: true }).eq('status', 'done').gte('updated_at', monthStart), 'id'),
    ])

    setStats({
      profiles: 0,
      active: a.count ?? 0,
      selected: s.count ?? 0,
      doneThisMonth: d.count ?? 0,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  return { stats, loading }
}

// ── Fetch popular proposals (vote_count >= 20, status=active) ──
export function usePopularProposals() {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await queryProposalSource((source, columns) => supabase
      .from(source)
      .select(columns)
      .eq('status', 'active')
      .gte('vote_count', 20)
      .order('vote_count', { ascending: false })
      .limit(10))
    if (error) setError(error.message ?? '안건을 불러오지 못했습니다.')
    else { setData((data ?? []) as Proposal[]); setError(null) }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  return { data, loading, error }
}

// ── Fetch selected/done proposals ──
export function useSelectedProposals(limit = 5) {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await queryProposalSource((source, columns) => supabase
      .from(source)
      .select(columns)
      .in('status', SELECTED_PROPOSAL_STATUSES)
      .gte('vote_count', 30)
      .order('vote_count', { ascending: false })
      .limit(limit))
    setData((data ?? []) as Proposal[])
    setLoading(false)
  }, [limit])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  return { data, loading }
}

// ── Fetch all archive (30표+) with optional filter ──
export function useArchive(filter: 'all' | 'done' | 'wip' | 'rejected' = 'all') {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const fetch = () => {
      setLoading(true)
      queryProposalSource((source, columns) => {
        let query = supabase.from(source).select(columns)
          .in('status', SELECTED_PROPOSAL_STATUSES)
          .gte('vote_count', 30)
          .order('created_at', { ascending: false })
        if (filter === 'done') query = query.eq('status', 'done')
        else if (filter === 'wip') query = query.in('status', ['selected', 'discussing'])
        else if (filter === 'rejected') query = query.eq('status', 'rejected')
        return query
      }).then(({ data }) => {
        const items = (data ?? []) as Proposal[]
        setData(items)
        if (filter === 'all') setTotal(items.length)
        setLoading(false)
      })
    }
    fetch()
    return subscribeToDataChanges(fetch)
  }, [filter])

  return { data, loading, total }
}

// ── Fetch single proposal by id ──
export function useProposal(id: string) {
  const [data, setData] = useState<Proposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!isUuid(id)) {
      setData(null)
      setLoading(false)
      return
    }
    const { data, error } = await queryProposalSource((source, columns) => supabase
      .from(source)
      .select(columns)
      .eq('id', id)
      .single())
    if (error) setError(error.message ?? '안건을 불러오지 못했습니다.')
    else setData(data as Proposal)
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  // Increment view count — 30분 이내 같은 안건 재방문은 카운트 제외 (새로고침 어뷰징 방지)
  useEffect(() => {
    if (!isUuid(id)) return
    const COOLDOWN_MS = 30 * 60 * 1000 // 30분
    const key = `viewed_${id}`
    const last = Number(localStorage.getItem(key) ?? 0)
    if (Date.now() - last < COOLDOWN_MS) return
    localStorage.setItem(key, String(Date.now()))
    supabase.rpc('increment_view_count', { proposal_id: id }).then(() => {})
  }, [id])

  return { data, loading, error, refetch: fetch }
}

// ── All active proposals (전체 안건 목록) ──────────────────
export type ProposalSort = 'votes' | 'date' | 'comments'

export function useAllProposals(
  category: string = 'all',
  sort: ProposalSort = 'votes',
) {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = () => {
      setLoading(true)
      queryProposalSource((source, columns) => {
        let query = supabase.from(source).select(columns).eq('status', 'active')
        if (category !== 'all') query = query.eq('category', category)
        if (sort === 'votes') query = query.order('vote_count', { ascending: false })
        else if (sort === 'comments') query = query.order('comment_count', { ascending: false })
        else query = query.order('created_at', { ascending: false })
        return query
      }).then(({ data, error }) => {
        if (error) {
          setData([])
          setError(error.message ?? '진행 중인 안건을 불러오지 못했습니다.')
        } else {
          setData((data ?? []) as Proposal[])
          setError(null)
        }
        setLoading(false)
      })
    }
    fetch()
    return subscribeToDataChanges(fetch)
  }, [category, sort])

  return { data, loading, error }
}

// ── My proposals ──
export function useMyProposals(userId: string | undefined) {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    const fetch = () => {
      queryProposalSource((source, columns) => supabase.from(source).select(columns).eq('author_id', userId)
        .order('created_at', { ascending: false }))
        .then(({ data }) => {
          setData((data ?? []) as Proposal[])
          setLoading(false)
        })
    }
    fetch()
    return subscribeToDataChanges(fetch)
  }, [userId])

  return { data, loading }
}

export function useUserNotifications(userId: string | undefined) {
  const [data, setData] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) { setData([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error) {
      setData(((data ?? []) as Notification[]).map(item => ({
        id: item.id,
        proposalId: item.proposal_id,
        title: item.title,
        message: item.message,
        kind: item.kind,
        createdAt: item.created_at,
        href: item.proposal_id ? `/proposals/${item.proposal_id}` : '/home',
        readAt: item.read_at,
      })))
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  return { data, loading, refetch: fetch }
}

export async function markNotificationRead(notificationId: string) {
  if (!isUuid(notificationId)) return { error: 'Invalid request.' }
  const { error } = await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function dismissNotification(notificationId: string) {
  if (!isUuid(notificationId)) return { error: 'Invalid request.' }
  const { error } = await supabase.from('notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', notificationId)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function markAllNotificationsRead(userId: string) {
  if (!isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function clearReadNotifications(userId: string) {
  if (!isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase.from('notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .not('read_at', 'is', null)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function voteProposal(proposalId: string, userId: string): Promise<{ error: string | null }> {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('votes')
    .insert({ proposal_id: proposalId, user_id: userId })
  if (error) return { error: error.message }
  announceDataChanged()
  return { error: null }
}

export async function unvoteProposal(proposalId: string, userId: string): Promise<{ error: string | null }> {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('votes')
    .delete()
    .match({ proposal_id: proposalId, user_id: userId })
  if (error) return { error: error.message }
  announceDataChanged()
  return { error: null }
}

// ── Check if user voted ──
export async function checkUserVoted(proposalId: string, userId: string): Promise<boolean> {
  if (!isUuid(proposalId) || !isUuid(userId)) return false
  const { data } = await supabase
    .from('votes')
    .select('id')
    .match({ proposal_id: proposalId, user_id: userId })
    .single()
  return !!data
}

// ── Submit new proposal ──
export async function submitProposal(params: {
  authorId: string
  category: ProposalCategory
  title: string
  body: string
  isAnonymous: boolean
}): Promise<{ data: Proposal | null; error: string | null }> {
  if (!isUuid(params.authorId)) return { data: null, error: 'Invalid request.' }
  const validated = validateProposalInput(params)
  if (validated.error || !validated.value) return { data: null, error: validated.error ?? 'Invalid request.' }

  const { data: rpcNewId, error: rpcError } = await supabase.rpc('create_proposal', {
    p_category: validated.value.category,
    p_title: validated.value.title,
    p_body: validated.value.body,
    p_is_anonymous: params.isAnonymous,
  })

  let newId = rpcNewId as string | null
  if (isMissingCreateProposalRpc(rpcError)) {
    const { data: legacyProposal, error: legacyError } = await supabase
      .from('proposals')
      .insert({
        author_id: params.authorId,
        category: validated.value.category,
        title: validated.value.title,
        body: validated.value.body,
        is_anonymous: params.isAnonymous,
      })
      .select('id')
      .single()

    if (legacyError || !legacyProposal?.id) {
      return { data: null, error: legacyError?.message ?? '안건을 등록하지 못했습니다.' }
    }
    newId = legacyProposal.id
  } else if (rpcError || !newId) {
    return { data: null, error: rpcError?.message ?? '안건을 등록하지 못했습니다.' }
  }

  const { data, error: fetchError } = await queryProposalSource((source, columns) => supabase
    .from(source)
    .select(columns)
    .eq('id', newId)
    .single())
  if (fetchError) return { data: null, error: fetchError.message ?? '등록된 안건을 다시 불러오지 못했습니다.' }
  announceDataChanged()
  return { data: data as Proposal, error: null }
}

// ── Report a proposal ──
export async function reportProposal(proposalId: string, reporterId: string, reason: string) {
  if (!isUuid(proposalId) || !isUuid(reporterId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('reports')
    .insert({ proposal_id: proposalId, reporter_id: reporterId, reason: validateReportReason(reason) })
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

// ── Admin: fetch selected proposals queue ──
export function useAdminQueue() {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data } = await queryProposalSource((source, columns) => supabase
      .from(source)
      .select(columns)
      .in('status', SELECTED_PROPOSAL_STATUSES)
      .gte('vote_count', 30)
      .order('vote_count', { ascending: false }))
    setData((data ?? []) as Proposal[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    return subscribeToDataChanges(refetch)
  }, [refetch])

  return { data, loading, refetch }
}

// ── Admin: update proposal status via RPC ──
export async function adminUpdateStatus(proposalId: string, newStatus: string) {
  if (!isUuid(proposalId) || !isProposalStatus(newStatus)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .rpc('update_proposal_status', { proposal_id: proposalId, new_status: newStatus })
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

// ── Admin: fetch reported proposals ──
export function useReportedProposals() {
  const [data, setData] = useState<{ proposal: Proposal; reportCount: number; reason: string }[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: reports, error } = await supabase.rpc('get_reported_proposals')

    if (error || !reports?.length) { setData([]); setLoading(false); return }

    const grouped: Record<string, { count: number; reason: string }> = {}
    for (const r of reports) {
      if (!grouped[r.proposal_id]) {
        grouped[r.proposal_id] = { count: Number(r.report_count), reason: r.latest_reason ?? '' }
      }
    }

    const ids = Object.keys(grouped)
    const { data: proposals } = await queryProposalSource((source, columns) => supabase
      .from(source)
      .select(columns)
      .in('id', ids))

    const result = ((proposals ?? []) as Proposal[]).map(p => ({
      proposal: p as Proposal,
      reportCount: grouped[p.id]?.count ?? 0,
      reason: grouped[p.id]?.reason ?? '',
    })).sort((a, b) => b.reportCount - a.reportCount)

    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  return { data, loading, refetch: fetch }
}

// ── Admin: dismiss all reports for a proposal ────────────────
export async function dismissReport(proposalId: string): Promise<{ error: string | null }> {
  if (!isUuid(proposalId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .rpc('dismiss_proposal_reports', { p_proposal_id: proposalId })
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

// ── Save/unsave ──
export async function saveProposal(proposalId: string, userId: string) {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('saves')
    .insert({ proposal_id: proposalId, user_id: userId })
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function unsaveProposal(proposalId: string, userId: string) {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('saves')
    .delete()
    .match({ proposal_id: proposalId, user_id: userId })
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

// ── Comments ──────────────────────────────────────────────
export function useComments(proposalId: string) {
  const [data, setData] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!isUuid(proposalId)) { setData([]); setLoading(false); return }
    const { data } = await supabase.rpc('get_proposal_comments', { p_proposal_id: proposalId })
    setData((data ?? []) as Comment[])
    setLoading(false)
  }, [proposalId])

  useEffect(() => {
    fetch()
    return subscribeToDataChanges(fetch)
  }, [fetch])

  return { data, loading, refetch: fetch }
}

export async function addComment(
  proposalId: string,
  authorId: string,
  content: string,
  isAnonymous: boolean,
): Promise<{ error: string | null }> {
  if (!isUuid(proposalId) || !isUuid(authorId)) return { error: 'Invalid request.' }
  const validated = validateCommentInput(content)
  if (validated.error || !validated.value) return { error: validated.error ?? 'Invalid request.' }

  const { error } = await supabase
    .from('comments')
    .insert({ proposal_id: proposalId, author_id: authorId, content: validated.value, is_anonymous: isAnonymous })
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function deleteComment(commentId: string): Promise<{ error: string | null }> {
  if (!isUuid(commentId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

// ── Notification settings ─────────────────────────────────
const DEFAULT_NOTIF: Omit<NotificationSettings, 'user_id' | 'updated_at'> = {
  on_selected: true,
  on_reply: true,
  on_voted: false,
}

export function useNotificationSettings(userId: string | undefined) {
  const [settings, setSettings] = useState(DEFAULT_NOTIF)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (data) setSettings({ on_selected: data.on_selected, on_reply: data.on_reply, on_voted: data.on_voted })
        setLoaded(true)
      })
  }, [userId])

  const updateSetting = async (key: keyof typeof DEFAULT_NOTIF, value: boolean) => {
    const previous = settings
    const next = { ...settings, [key]: value }
    setSettings(next)
    setSaving(true)
    setError(null)
    if (!userId) { setSaving(false); return { error: '로그인이 필요합니다.' } }
    const { error } = await supabase
      .from('notification_settings')
      .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() })
    setSaving(false)
    if (error) {
      setSettings(previous)
      setError('알림 설정을 저장하지 못했습니다.')
    }
    return { error: error?.message ?? null }
  }

  return { settings, loaded, saving, error, updateSetting }
}

// ── Check if user saved a proposal ──────────────────────────
export async function checkUserSaved(proposalId: string, userId: string): Promise<boolean> {
  if (!isUuid(proposalId) || !isUuid(userId)) return false
  const { data } = await supabase
    .from('saves')
    .select('id')
    .match({ proposal_id: proposalId, user_id: userId })
    .single()
  return !!data
}

// ── Saves count for a proposal ───────────────────────────────
export async function getSavesCount(proposalId: string): Promise<number> {
  if (!isUuid(proposalId)) return 0
  const { data } = await supabase.rpc('get_proposal_save_count', { p_proposal_id: proposalId })
  return Number(data ?? 0)
}

// ── Delete a proposal ────────────────────────────────────────
export async function deleteProposal(proposalId: string) {
  if (!isUuid(proposalId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('proposals')
    .delete()
    .eq('id', proposalId)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

// ── Update a proposal (author only, status=active) ───────────
export async function updateProposal(
  proposalId: string,
  params: { category?: ProposalCategory; title?: string; body?: string },
) {
  if (!isUuid(proposalId) || !params.category || !params.title || !params.body) return { error: 'Invalid request.' }
  const validated = validateProposalInput({ category: params.category, title: params.title, body: params.body })
  if (validated.error || !validated.value) return { error: validated.error ?? 'Invalid request.' }

  const { error } = await supabase
    .from('proposals')
    .update(validated.value)
    .eq('id', proposalId)
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

// ── Upsert official reply (admin only) ───────────────────────
export async function upsertOfficialReply(
  proposalId: string,
  content: string,
  signedBy: string,
) {
  if (!isUuid(proposalId)) return { error: 'Invalid request.' }
  const validated = validateOfficialReply({ content, signedBy })
  if (validated.error || !validated.value) return { error: validated.error ?? 'Invalid request.' }

  const { error } = await supabase
    .from('official_replies')
    .upsert(
      { proposal_id: proposalId, content: validated.value.content, signed_by: validated.value.signedBy },
      { onConflict: 'proposal_id' },
    )
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}

export async function adminDeleteProposal(proposalId: string) {
  if (!isUuid(proposalId)) return { error: 'Invalid request.' }
  const { error } = await supabase.rpc('delete_proposal_as_admin', { p_proposal_id: proposalId })
  if (!error) announceDataChanged()
  return { error: error?.message ?? null }
}
