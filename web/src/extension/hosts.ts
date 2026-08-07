import browser from 'webextension-polyfill'

const HOSTS_KEY = 'hosts'
const TOKENS_KEY = 'tokens'

export interface HostConfig {
  id: string
  host: string
  apiBase: string
  userId: number
  username: string
}

export function hostIdFor(host: string): string {
  return host.trim().toLowerCase()
}

export function originFor(host: string): string {
  return `https://${host}/*`
}

async function read<T>(key: string, fallback: T): Promise<T> {
  const stored = await browser.storage.local.get(key)
  return (stored[key] as T | undefined) ?? fallback
}

export async function listHosts(): Promise<HostConfig[]> {
  return read<HostConfig[]>(HOSTS_KEY, [])
}

export async function getHost(id: string): Promise<HostConfig | null> {
  return (await listHosts()).find((host) => host.id === id) ?? null
}

export async function saveHost(
  config: HostConfig,
  token: string,
): Promise<void> {
  const hosts = (await listHosts()).filter((host) => host.id !== config.id)
  const tokens = await read<Record<string, string>>(TOKENS_KEY, {})
  await browser.storage.local.set({
    [HOSTS_KEY]: [...hosts, config],
    [TOKENS_KEY]: { ...tokens, [config.id]: token },
  })
}

export async function removeHost(id: string): Promise<void> {
  const hosts = (await listHosts()).filter((host) => host.id !== id)
  const tokens = await read<Record<string, string>>(TOKENS_KEY, {})
  delete tokens[id]
  await browser.storage.local.set({ [HOSTS_KEY]: hosts, [TOKENS_KEY]: tokens })
}

export async function getToken(id: string): Promise<string | null> {
  const tokens = await read<Record<string, string>>(TOKENS_KEY, {})
  return tokens[id] ?? null
}
