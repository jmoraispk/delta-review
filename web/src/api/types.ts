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

export interface Discussion {
  id: string
  notes: Array<{
    id?: number
    body?: string
    position?: {
      old_path?: string
      new_path?: string
      old_line?: number | null
      new_line?: number | null
    } | null
    resolved?: boolean
  }>
}
