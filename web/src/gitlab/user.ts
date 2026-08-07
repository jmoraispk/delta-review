import type { GitLabClient } from './client'

export interface GitLabUser {
  id: number
  username: string
  name: string
  avatar_url?: string
}

export async function getCurrentUser(
  client: GitLabClient,
  signal?: AbortSignal,
): Promise<GitLabUser> {
  return client.request<GitLabUser>('GET', '/user', { signal })
}
