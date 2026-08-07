import { codeForStatus, GitLabError } from './errors'

const TIMEOUT_MS = 30_000

export interface RequestOptions {
  json?: unknown
  params?: Record<string, string>
  signal?: AbortSignal
}

export class GitLabClient {
  private readonly apiBase: string
  private readonly token: string

  constructor(apiBase: string, token: string) {
    this.apiBase = apiBase.replace(/\/+$/, '')
    this.token = token
  }

  private url(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.apiBase}${path}`)
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value)
    }
    return url.toString()
  }

  private async send(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'PRIVATE-TOKEN': this.token,
    }
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout
    try {
      return await fetch(this.url(path, options.params), {
        method,
        headers,
        body:
          options.json === undefined ? undefined : JSON.stringify(options.json),
        signal,
      })
    } catch (error) {
      if (timeout.aborted) {
        throw new GitLabError(504, 'GitLab request timed out', 'gitlab_timeout')
      }
      if (options.signal?.aborted) throw error
      throw new GitLabError(502, 'Could not reach GitLab', 'gitlab_unavailable')
    }
  }

  private static async raiseForError(response: Response): Promise<void> {
    if (response.ok) return
    const text = await response.text()
    let message = text
    try {
      const payload = JSON.parse(text) as unknown
      if (payload && typeof payload === 'object' && 'message' in payload) {
        const value = (payload as { message: unknown }).message
        message = typeof value === 'string' ? value : JSON.stringify(value)
      } else if (payload !== null && typeof payload !== 'object') {
        message = String(payload)
      }
    } catch {
      // Not JSON; the raw body is the message.
    }
    throw new GitLabError(
      response.status,
      message,
      codeForStatus(response.status),
    )
  }

  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await this.send(method, path, options)
    await GitLabClient.raiseForError(response)
    return (await response.json()) as T
  }

  async paginate<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    const results: T[] = []
    let page = 1
    for (;;) {
      const response = await this.send('GET', path, {
        params: { page: String(page), per_page: '100' },
        signal,
      })
      await GitLabClient.raiseForError(response)
      results.push(...((await response.json()) as T[]))
      const next = response.headers.get('x-next-page')
      if (!next) return results
      page = Number(next)
    }
  }
}
