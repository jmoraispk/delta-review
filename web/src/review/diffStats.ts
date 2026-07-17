export interface DiffStats {
  additions: number
  deletions: number
}

export function diffStatsLabel(stats: DiffStats): string {
  const addition = stats.additions === 1 ? 'addition' : 'additions'
  const deletion = stats.deletions === 1 ? 'deletion' : 'deletions'
  return `${stats.additions} ${addition}, ${stats.deletions} ${deletion}`
}

export function diffStats(diff: string): DiffStats {
  let additions = 0
  let deletions = 0
  let insideHunk = false

  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      insideHunk = true
      continue
    }
    if (!insideHunk) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }

  return { additions, deletions }
}
