const SESSION_KEY = 'delta-session'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(
    status: number,
    message: string,
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function initializeSession(): string {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const fromHash = hash.get('session')
  if (fromHash) {
    sessionStorage.setItem(SESSION_KEY, fromHash)
    history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    )
  }
  const session = fromHash ?? sessionStorage.getItem(SESSION_KEY)
  if (!session) {
    throw new Error('Delta session is missing. Launch Delta from the CLI.')
  }
  return session
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('X-Delta-Session', initializeSession())

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: string
      detail?: string
      message?: string
    } | null
    throw new ApiError(
      response.status,
      payload?.message ??
        payload?.detail ??
        `Request failed (${response.status})`,
      payload?.code,
    )
  }
  return response.json() as Promise<T>
}
