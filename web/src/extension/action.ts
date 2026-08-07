import browser from 'webextension-polyfill'

import { buildReviewHash } from '../hub/route'
import { parseMergeRequestUrl } from '../hub/mrUrl'
import { listHosts, type HostConfig } from './hosts'

const HUB_TAB_KEY = 'hubTabId'

export function hashForTab(
  url: string | undefined,
  hosts: HostConfig[],
): string {
  if (!url) return '#/'
  const target = parseMergeRequestUrl(url, hosts)
  return target ? buildReviewHash(target) : '#/'
}

async function knownHubTab(): Promise<number | null> {
  const stored = await browser.storage.local.get(HUB_TAB_KEY)
  const id = stored[HUB_TAB_KEY]
  if (typeof id !== 'number') return null
  try {
    await browser.tabs.get(id)
    return id
  } catch {
    return null
  }
}

export async function openHub(url: string | undefined): Promise<void> {
  const hosts = await listHosts()
  const target = browser.runtime.getURL(`hub.html${hashForTab(url, hosts)}`)

  const existing = await knownHubTab()
  if (existing !== null) {
    await browser.tabs.update(existing, { url: target, active: true })
    return
  }
  const created = await browser.tabs.create({ url: target })
  if (typeof created.id === 'number') {
    await browser.storage.local.set({ [HUB_TAB_KEY]: created.id })
  }
}
