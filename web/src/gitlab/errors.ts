export class GitLabError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, message: string, code = 'gitlab_error') {
    super(message)
    this.name = 'GitLabError'
    this.status = status
    this.code = code
  }
}

const STATUS_CODES: Record<number, string> = {
  401: 'gitlab_authentication_failed',
  403: 'gitlab_access_denied',
  404: 'gitlab_not_found',
  429: 'gitlab_rate_limited',
}

export function codeForStatus(status: number): string {
  return (
    STATUS_CODES[status] ??
    (status >= 500 ? 'gitlab_unavailable' : 'gitlab_error')
  )
}
