import type { DiffFile } from '@git-diff-view/core'

export type DiffTheme = 'light' | 'dark'
export type DiffMode = 'unified' | 'split'

/** The serialized diff state the worker hands back. */
export type DiffBundle = ReturnType<DiffFile['_getFullBundle']>

/** Bundles held in memory. Enough for a scroll window plus recent history. */
export const BUNDLE_CACHE_LIMIT = 24

interface PendingRequest {
  resolve: (bundle: DiffBundle) => void
  reject: (error: Error) => void
}

// Map keeps insertion order, which is all an LRU needs: delete then re-set
// on read moves an entry to the end, so the first key is the oldest.
const cache = new Map<string, DiffBundle>()
const pending = new Map<number, PendingRequest>()
let worker: Worker | null = null
let nextRequestId = 0

/**
 * Whether diffs can be built off the main thread. Callers build inline and
 * synchronously when this is false, which keeps jsdom rendering in one tick.
 */
export function workersAvailable(): boolean {
  return typeof Worker !== 'undefined'
}

export function bundleCacheKey(
  path: string,
  theme: DiffTheme,
  mode: DiffMode,
): string {
  return `${path}::${theme}::${mode}`
}

export function cachedBundle(key: string): DiffBundle | undefined {
  const bundle = cache.get(key)
  if (bundle === undefined) return undefined
  cache.delete(key)
  cache.set(key, bundle)
  return bundle
}

function remember(key: string, bundle: DiffBundle): void {
  cache.set(key, bundle)
  while (cache.size > BUNDLE_CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

function failAll(error: Error): void {
  for (const request of pending.values()) request.reject(error)
  pending.clear()
  worker?.terminate()
  worker = null
}

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker

  worker = new Worker(new URL('./diffWorker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = (
    event: MessageEvent<{ id: number; bundle: DiffBundle }>,
  ) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    request.resolve(event.data.bundle)
  }
  worker.onerror = () => failAll(new Error('The diff worker failed'))
  worker.onmessageerror = () => failAll(new Error('The diff worker failed'))
  return worker
}

export function requestBundle(
  key: string,
  data: unknown,
  theme: DiffTheme,
  mode: DiffMode,
): Promise<DiffBundle> {
  const hit = cachedBundle(key)
  if (hit !== undefined) return Promise.resolve(hit)

  const active = ensureWorker()
  if (!active) return Promise.reject(new Error('Workers are unavailable'))

  nextRequestId += 1
  const id = nextRequestId
  return new Promise<DiffBundle>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    active.postMessage({ id, data, theme, mode })
  }).then((bundle) => {
    remember(key, bundle)
    return bundle
  })
}

/** Drops the worker and every cached bundle. Tests only. */
export function resetDiffWorker(): void {
  failAll(new Error('The diff worker was reset'))
  cache.clear()
  nextRequestId = 0
}
