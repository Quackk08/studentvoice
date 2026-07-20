export type ProposalStatus = 'active' | 'selected' | 'discussing' | 'done' | 'rejected' | 'blinded'
export type ProposalCategory = '#시설' | '#급식' | '#교칙' | '#학사' | '#수업' | '#복지' | '#기타'

export interface Profile {
  id: string
  email: string
  name: string | null
  grade: number | null
  class: number | null
  is_admin: boolean
  agreed_to_guidelines: boolean
  created_at: string
}

export interface Proposal {
  id: string
  /** Only populated for the author or an administrator. */
  author_id: string | null
  category: ProposalCategory
  title: string
  body: string
  is_anonymous: boolean
  status: ProposalStatus
  vote_count: number
  view_count: number
  comment_count: number
  created_at: string
  updated_at: string
  // Safe author summary from proposal_feed.
  author_name?: string | null
  author_grade?: number | null
  author_class?: number | null
  author_email?: string | null
  official_replies?: OfficialReply[]
  user_voted?: boolean
  user_saved?: boolean
}

export interface OfficialReply {
  id: string
  proposal_id: string
  content: string
  signed_by: string
  created_at: string
}

export interface Report {
  id: string
  proposal_id: string
  reporter_id: string
  reason: string
  created_at: string
}

export interface Save {
  id: string
  proposal_id: string
  user_id: string
  created_at: string
}

export interface Comment {
  id: string
  proposal_id: string
  /** Only populated for the author or an administrator. */
  author_id: string | null
  content: string
  is_anonymous: boolean
  created_at: string
  author_name?: string | null
  author_grade?: number | null
}

export interface Notification {
  id: string
  user_id: string
  proposal_id: string | null
  kind: 'selected' | 'discussing' | 'done' | 'rejected' | 'reply'
  title: string
  message: string
  created_at: string
  read_at: string | null
  dismissed_at: string | null
}

export interface NotificationSettings {
  user_id: string
  on_selected: boolean
  on_reply: boolean
  on_voted: boolean
  updated_at: string
}
