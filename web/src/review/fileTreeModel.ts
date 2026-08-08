import type { DiffFile } from '../api/types'

export interface DirRow {
  kind: 'dir'
  /** Full directory path, used as the collapse key. */
  path: string
  /** Display name, which may span several levels once compressed. */
  name: string
  depth: number
  fileCount: number
}

export interface FileRow {
  kind: 'file'
  path: string
  name: string
  depth: number
  /** Index into the original diff list, so selection stays stable. */
  fileIndex: number
  file: DiffFile
}

export type TreeRow = DirRow | FileRow

interface DirNode {
  path: string
  name: string
  dirs: Map<string, DirNode>
  files: { name: string; fileIndex: number; file: DiffFile }[]
}

function emptyDir(path: string, name: string): DirNode {
  return { path, name, dirs: new Map(), files: [] }
}

function filePath(file: DiffFile): string {
  return file.new_path || file.old_path
}

/**
 * Collapse a directory that holds exactly one directory and no files into
 * its child, so `notebooks/torch/pusch` reads as a single row.
 */
function compress(node: DirNode): DirNode {
  const compressed = emptyDir(node.path, node.name)
  compressed.files = node.files
  for (const child of node.dirs.values()) {
    let merged = compress(child)
    while (merged.files.length === 0 && merged.dirs.size === 1) {
      const [only] = [...merged.dirs.values()]
      merged = {
        path: only.path,
        name: `${merged.name}/${only.name}`,
        dirs: only.dirs,
        files: only.files,
      }
    }
    compressed.dirs.set(merged.path, merged)
  }
  return compressed
}

export function buildFileTree(files: DiffFile[]): DirNode {
  const root = emptyDir('', '')
  files.forEach((file, fileIndex) => {
    const segments = filePath(file).split('/').filter(Boolean)
    const name = segments.pop()
    if (!name) return
    let node = root
    for (const segment of segments) {
      const path = node.path ? `${node.path}/${segment}` : segment
      const existing = node.dirs.get(path) ?? emptyDir(path, segment)
      node.dirs.set(path, existing)
      node = existing
    }
    node.files.push({ name, fileIndex, file })
  })
  return compress(root)
}

export function flattenTree(
  root: DirNode,
  collapsed: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = []

  function walk(node: DirNode, depth: number) {
    const dirs = [...node.dirs.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    )
    for (const dir of dirs) {
      rows.push({
        kind: 'dir',
        path: dir.path,
        name: dir.name,
        depth,
        fileCount: countFiles(dir),
      })
      if (!collapsed.has(dir.path)) walk(dir, depth + 1)
    }
    // Directories sort, files keep the order GitLab returned them in.
    for (const entry of node.files) {
      rows.push({
        kind: 'file',
        path: filePath(entry.file),
        name: entry.name,
        depth,
        fileIndex: entry.fileIndex,
        file: entry.file,
      })
    }
  }

  walk(root, 0)
  return rows
}

function countFiles(node: DirNode): number {
  let total = node.files.length
  for (const dir of node.dirs.values()) total += countFiles(dir)
  return total
}

/** Every directory path that must be open for `path` to be visible. */
export function ancestorPaths(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  const paths: string[] = []
  segments.forEach((segment, index) => {
    paths.push(index === 0 ? segment : `${paths[index - 1]}/${segment}`)
  })
  return paths
}

/** Directory rows that must be open for a file row to be reachable. */
export function ancestorsOfFile(rows: TreeRow[], fileIndex: number): string[] {
  const row = rows.find(
    (candidate) => candidate.kind === 'file' && candidate.fileIndex === fileIndex,
  )
  if (!row) return []
  const segments = row.path.split('/').filter(Boolean)
  segments.pop()
  return ancestorPaths(segments.join('/'))
}
