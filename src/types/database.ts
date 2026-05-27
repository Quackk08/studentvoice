export type ProposalStatus = 'active' | 'selected' | 'done' | 'rejected' | 'blinded'
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
  author_id: string
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
  // Joined
  profiles?: Pick<Profile, 'id' | 'email' | 'grade' | 'class' | 'is_admin'>
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
  author_id: string
  content: string
  is_anonymous: boolean
  created_at: string
  profiles?: Pick<Profile, 'id' | 'name' | 'grade' | 'class'>
}

export interface NotificationSettings {
  user_id: string
  on_selected: boolean
  on_reply: boolean
  on_voted: boolean
  updated_at: string
}
