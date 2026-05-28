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
import type { Proposal, ProposalCategory, Comment, NotificationSettings } from '../types/database'

export type UserNotificationKind = 'selected' | 'done' | 'rejected' | 'reply'

export interface UserNotification {
  id: string
  proposalId: string
  title: string
  message: string
  kind: UserNotificationKind
  createdAt: string
  href: string
}

export function useNoticeStats() {
  const [stats, setStats] = useState({
    deliveredThisMonth: 0,
    latestDeliveredAt: null as string | null,
  })
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { data, count } = await supabase
      .from('proposals')
      .select('updated_at, created_at', { count: 'exact' })
      .in('status', ['selected', 'done', 'rejected'])
      .gte('updated_at', monthStart)
      .order('updated_at', { ascending: false })

    setStats({
      deliveredThisMonth: count ?? 0,
      latestDeliveredAt: data?.[0]?.updated_at ?? data?.[0]?.created_at ?? null,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()

    const channel = supabase
      .channel('notice-proposals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, fetch)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
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

  useEffect(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    supabase.rpc('get_public_home_stats').then(async ({ data, error }) => {
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
        supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('proposals').select('*', { count: 'exact', head: true }).in('status', ['selected', 'done', 'rejected']),
        supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', 'done').gte('updated_at', monthStart),
      ])

      setStats({
        profiles: 0,
        active: a.count ?? 0,
        selected: s.count ?? 0,
        doneThisMonth: d.count ?? 0,
      })
      setLoading(false)
    })
  }, [])

  return { stats, loading }
}

// ── Fetch popular proposals (vote_count >= 20, status=active) ──
export function usePopularProposals() {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('proposals')
      .select('*, official_replies(*)')
      .eq('status', 'active')
      .gte('vote_count', 20)
      .order('vote_count', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data ?? []) as Proposal[])
        setLoading(false)
      })
  }, [])

  return { data, loading, error }
}

// ── Fetch selected/done proposals ──
export function useSelectedProposals(limit = 5) {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('proposals')
      .select('*, official_replies(*)')
      .in('status', ['selected', 'done', 'rejected'])
      .order('vote_count', { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        setData((data ?? []) as Proposal[])
        setLoading(false)
      })
  }, [limit])

  return { data, loading }
}

// ── Fetch all archive (30표+) with optional filter ──
export function useArchive(filter: 'all' | 'done' | 'wip' | 'rejected' = 'all') {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    let query = supabase
      .from('proposals')
      .select('*, official_replies(*)')
      .in('status', ['selected', 'done', 'rejected'])
      .order('created_at', { ascending: false })

    if (filter === 'done') query = query.eq('status', 'done')
    else if (filter === 'wip') query = query.in('status', ['selected'])
    else if (filter === 'rejected') query = query.eq('status', 'rejected')

    query.then(({ data }) => {
      const items = (data ?? []) as Proposal[]
      setData(items)
      if (filter === 'all') setTotal(items.length)
      setLoading(false)
    })
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
    const { data, error } = await supabase
      .from('proposals')
      .select('*, profiles(id, email, grade, class, is_admin), official_replies(*)')
      .eq('id', id)
      .single()
    if (error) setError(error.message)
    else setData(data as Proposal)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  // Increment view count
  useEffect(() => {
    if (isUuid(id)) {
      supabase.rpc('increment_view_count', { proposal_id: id }).then(() => {})
    }
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

  useEffect(() => {
    setLoading(true)
    let query = supabase
      .from('proposals')
      .select('*, profiles(id, grade, class)')
      .eq('status', 'active')

    if (category !== 'all') {
      query = query.eq('category', category)
    }

    if (sort === 'votes') {
      query = query.order('vote_count', { ascending: false })
    } else if (sort === 'comments') {
      query = query.order('comment_count', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    query.then(({ data }) => {
      setData((data ?? []) as Proposal[])
      setLoading(false)
    })
  }, [category, sort])

  return { data, loading }
}

// ── My proposals ──
export function useMyProposals(userId: string | undefined) {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    supabase
      .from('proposals')
      .select('*')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setData((data ?? []) as Proposal[])
        setLoading(false)
      })
  }, [userId])

  return { data, loading }
}

// ── Vote on a proposal ──
export function useUserNotifications(userId: string | undefined) {
  const [data, setData] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setData([]); setLoading(false); return }

    setLoading(true)
    supabase
      .from('proposals')
      .select('id, title, status, updated_at, created_at, official_replies(*)')
      .eq('author_id', userId)
      .neq('status', 'active')
      .neq('status', 'blinded')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        const notifications = ((data ?? []) as Proposal[]).flatMap(proposal => {
          const items: UserNotification[] = []
          const href = `/proposals/${proposal.id}`
          const createdAt = proposal.updated_at ?? proposal.created_at

          if (proposal.status === 'selected') {
            items.push({
              id: `status:${proposal.id}:selected:${createdAt}`,
              proposalId: proposal.id,
              title: '내 안건이 선정되었습니다',
              message: proposal.title,
              kind: 'selected',
              createdAt,
              href,
            })
          }

          if (proposal.status === 'done') {
            items.push({
              id: `status:${proposal.id}:done:${createdAt}`,
              proposalId: proposal.id,
              title: '내 안건이 반영되었습니다',
              message: proposal.title,
              kind: 'done',
              createdAt,
              href,
            })
          }

          if (proposal.status === 'rejected') {
            items.push({
              id: `status:${proposal.id}:rejected:${createdAt}`,
              proposalId: proposal.id,
              title: '내 안건 검토 결과가 도착했습니다',
              message: proposal.title,
              kind: 'rejected',
              createdAt,
              href,
            })
          }

          for (const reply of proposal.official_replies ?? []) {
            items.push({
              id: `reply:${proposal.id}:${reply.id}`,
              proposalId: proposal.id,
              title: '학생회 공식 답변이 달렸습니다',
              message: proposal.title,
              kind: 'reply',
              createdAt: reply.created_at,
              href,
            })
          }

          return items
        })

        notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setData(notifications)
        setLoading(false)
      })
  }, [userId])

  return { data, loading }
}

export async function voteProposal(proposalId: string, userId: string): Promise<{ error: string | null }> {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('votes')
    .insert({ proposal_id: proposalId, user_id: userId })
  if (error) return { error: error.message }
  return { error: null }
}

export async function unvoteProposal(proposalId: string, userId: string): Promise<{ error: string | null }> {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('votes')
    .delete()
    .match({ proposal_id: proposalId, user_id: userId })
  if (error) return { error: error.message }
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

  const { data, error } = await supabase
    .from('proposals')
    .insert({
      author_id: params.authorId,
      category: validated.value.category,
      title: validated.value.title,
      body: validated.value.body,
      is_anonymous: params.isAnonymous,
    })
    .select()
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as Proposal, error: null }
}

// ── Report a proposal ──
export async function reportProposal(proposalId: string, reporterId: string, reason: string) {
  if (!isUuid(proposalId) || !isUuid(reporterId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('reports')
    .insert({ proposal_id: proposalId, reporter_id: reporterId, reason: validateReportReason(reason) })
  return { error: error?.message ?? null }
}

// ── Admin: fetch selected proposals queue ──
export function useAdminQueue() {
  const [data, setData] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('proposals')
      .select('*, profiles(email)')
      .in('status', ['selected', 'done', 'rejected'])
      .order('vote_count', { ascending: false })
    setData((data ?? []) as Proposal[])
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, refetch }
}

// ── Admin: update proposal status via RPC ──
export async function adminUpdateStatus(proposalId: string, newStatus: string) {
  if (!isUuid(proposalId) || !isProposalStatus(newStatus)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .rpc('update_proposal_status', { proposal_id: proposalId, new_status: newStatus })
  return { error: error?.message ?? null }
}

// ── Admin: fetch reported proposals ──
export function useReportedProposals() {
  const [data, setData] = useState<{ proposal: Proposal; reportCount: number; reason: string }[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: reports } = await supabase
      .from('reports')
      .select('proposal_id, reason, created_at')
      .order('created_at', { ascending: false })

    if (!reports?.length) { setData([]); setLoading(false); return }

    const grouped: Record<string, { count: number; reason: string }> = {}
    for (const r of reports) {
      if (!grouped[r.proposal_id]) {
        grouped[r.proposal_id] = { count: 0, reason: r.reason ?? '' }
      }
      grouped[r.proposal_id].count++
    }

    const ids = Object.keys(grouped)
    const { data: proposals } = await supabase
      .from('proposals')
      .select('*, profiles(email)')
      .in('id', ids)

    const result = (proposals ?? []).map(p => ({
      proposal: p as Proposal,
      reportCount: grouped[p.id]?.count ?? 0,
      reason: grouped[p.id]?.reason ?? '',
    })).sort((a, b) => b.reportCount - a.reportCount)

    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, refetch: fetch }
}

// ── Admin: dismiss all reports for a proposal ────────────────
export async function dismissReport(proposalId: string): Promise<{ error: string | null }> {
  if (!isUuid(proposalId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('proposal_id', proposalId)
  return { error: error?.message ?? null }
}

// ── Save/unsave ──
export async function saveProposal(proposalId: string, userId: string) {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('saves')
    .insert({ proposal_id: proposalId, user_id: userId })
  return { error: error?.message ?? null }
}

export async function unsaveProposal(proposalId: string, userId: string) {
  if (!isUuid(proposalId) || !isUuid(userId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('saves')
    .delete()
    .match({ proposal_id: proposalId, user_id: userId })
  return { error: error?.message ?? null }
}

// ── Comments ──────────────────────────────────────────────
export function useComments(proposalId: string) {
  const [data, setData] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(id, name, grade)')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true })
    setData((data ?? []) as Comment[])
    setLoading(false)
  }, [proposalId])

  useEffect(() => { fetch() }, [fetch])

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
  return { error: error?.message ?? null }
}

export async function deleteComment(commentId: string): Promise<{ error: string | null }> {
  if (!isUuid(commentId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
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
    const next = { ...settings, [key]: value }
    setSettings(next)
    if (!userId) return
    await supabase
      .from('notification_settings')
      .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() })
  }

  return { settings, loaded, updateSetting }
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
  const { count } = await supabase
    .from('saves')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', proposalId)
  return count ?? 0
}

// ── Delete a proposal ────────────────────────────────────────
export async function deleteProposal(proposalId: string) {
  if (!isUuid(proposalId)) return { error: 'Invalid request.' }
  const { error } = await supabase
    .from('proposals')
    .delete()
    .eq('id', proposalId)
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
  return { error: error?.message ?? null }
}
