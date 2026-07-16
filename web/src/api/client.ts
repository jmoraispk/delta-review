const SESSION_KEY = 'delta-session'

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
    const error = await response.json().catch(() => null)
    throw new Error(error?.message ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}
