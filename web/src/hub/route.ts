import type { ReviewTarget } from '../transport/types'

export type Route =
  | { name: 'lists' }
  | { name: 'settings' }
  | { name: 'review'; target: ReviewTarget }

export function buildReviewHash(target: ReviewTarget): string {
  return `#/mr/${encodeURIComponent(target.hostId)}/${encodeURIComponent(
    target.project,
  )}/${target.iid}`
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '')
  if (path === '/settings') return { name: 'settings' }

  const segments = path.split('/').filter(Boolean)
  if (segments[0] !== 'mr' || segments.length !== 4) return { name: 'lists' }

  const iid = Number(segments[3])
  if (!Number.isInteger(iid) || iid <= 0) return { name: 'lists' }

  // decodeURIComponent throws on a bad percent sequence, and a hash can always
  // be hand-edited. Fall back to the lists rather than letting the hub crash.
  let hostId: string
  let project: string
  try {
    hostId = decodeURIComponent(segments[1])
    project = decodeURIComponent(segments[2])
  } catch {
    return { name: 'lists' }
  }

  return { name: 'review', target: { hostId, project, iid } }
}
