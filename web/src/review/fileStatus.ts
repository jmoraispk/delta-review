import type { DiffFile } from '../api/types'

export interface FileStatus {
  glyph: string
  label: string
  variant: string
}

/** The single change marker shown beside a file, GitLab-style. */
export function fileStatus(file: DiffFile): FileStatus {
  if (file.too_large)
    return { glyph: '!', label: 'too large', variant: 'is-blocked' }
  if (file.collapsed)
    return { glyph: '…', label: 'collapsed', variant: 'is-blocked' }
  if (file.new_file) return { glyph: '+', label: 'added', variant: 'is-added' }
  if (file.deleted_file)
    return { glyph: '−', label: 'deleted', variant: 'is-deleted' }
  if (file.renamed_file)
    return { glyph: '↦', label: 'moved', variant: 'is-moved' }
  return { glyph: '▪', label: 'modified', variant: 'is-modified' }
}
