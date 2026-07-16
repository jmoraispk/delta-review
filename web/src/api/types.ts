export interface DeltaConfig {
  host: string
  project: string
  mr_iid: number
}

export interface MergeRequest {
  iid: number
  title: string
  web_url: string
  state: string
  source_branch: string
  target_branch: string
}

export interface DiffFile {
  old_path: string
  new_path: string
  diff: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
  collapsed: boolean
  too_large: boolean
}

export interface NotePosition {
  old_path?: string
  new_path?: string
  old_line?: number | null
  new_line?: number | null
}

export interface DiscussionNote {
  id: number | string
  body: string
  author?: {
    name: string
    username: string
    avatar_url?: string
  }
  created_at?: string
  position?: NotePosition | null
  resolvable?: boolean
  resolved?: boolean
}

export interface Discussion {
  id: string
  individual_note?: boolean
  notes: DiscussionNote[]
}

export interface PostingResult {
  placement: 'inline' | 'general'
  discussion: Discussion
}
