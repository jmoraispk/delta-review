import { afterEach, expect, test, vi } from 'vitest'

import {
  BUNDLE_CACHE_LIMIT,
  bundleCacheKey,
  cachedBundle,
  requestBundle,
  resetDiffWorker,
} from '../review/diffWorkerClient'

class FakeWorker {
  static instances = 0
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false

  constructor() {
    FakeWorker.instances += 1
  }

  postMessage(request: { id: number }) {
    queueMicrotask(() => {
      this.onmessage?.({
        data: { id: request.id, bundle: { built: request.id } },
      } as MessageEvent)
    })
  }

  terminate() {
    this.terminated = true
  }
}

afterEach(() => {
  resetDiffWorker()
  FakeWorker.instances = 0
  vi.unstubAllGlobals()
})

function useFakeWorker() {
  vi.stubGlobal('Worker', FakeWorker)
}

const data = { hunks: [] }

test('builds a bundle and serves the next request from cache', async () => {
  useFakeWorker()
  const key = bundleCacheKey('a.ts', 'dark', 'unified')

  const first = await requestBundle(key, data, 'dark', 'unified')
  expect(first).toEqual({ built: 1 })
  expect(cachedBundle(key)).toEqual({ built: 1 })

  const second = await requestBundle(key, data, 'dark', 'unified')
  expect(second).toEqual({ built: 1 })
})

test('reuses a single worker across many files', async () => {
  useFakeWorker()

  for (let index = 0; index < 5; index += 1) {
    await requestBundle(
      bundleCacheKey(`file-${index}.ts`, 'dark', 'unified'),
      data,
      'dark',
      'unified',
    )
  }

  expect(FakeWorker.instances).toBe(1)
})

test('keys bundles separately per theme and view mode', () => {
  expect(bundleCacheKey('a.ts', 'dark', 'unified')).not.toBe(
    bundleCacheKey('a.ts', 'light', 'unified'),
  )
  expect(bundleCacheKey('a.ts', 'dark', 'unified')).not.toBe(
    bundleCacheKey('a.ts', 'dark', 'split'),
  )
})

test('evicts the least recently used bundle past the cache limit', async () => {
  useFakeWorker()
  const first = bundleCacheKey('file-0.ts', 'dark', 'unified')

  for (let index = 0; index <= BUNDLE_CACHE_LIMIT; index += 1) {
    await requestBundle(
      bundleCacheKey(`file-${index}.ts`, 'dark', 'unified'),
      data,
      'dark',
      'unified',
    )
  }

  expect(cachedBundle(first)).toBeUndefined()
})

test('keeps a bundle alive when it is read again', async () => {
  useFakeWorker()
  const first = bundleCacheKey('file-0.ts', 'dark', 'unified')
  await requestBundle(first, data, 'dark', 'unified')

  for (let index = 1; index < BUNDLE_CACHE_LIMIT; index += 1) {
    await requestBundle(
      bundleCacheKey(`file-${index}.ts`, 'dark', 'unified'),
      data,
      'dark',
      'unified',
    )
    cachedBundle(first)
  }
  await requestBundle(
    bundleCacheKey('overflow.ts', 'dark', 'unified'),
    data,
    'dark',
    'unified',
  )

  expect(cachedBundle(first)).toEqual({ built: 1 })
})

test('falls back when the platform has no worker', async () => {
  vi.stubGlobal('Worker', undefined)

  await expect(
    requestBundle(bundleCacheKey('x.ts', 'dark', 'unified'), data, 'dark', 'unified'),
  ).rejects.toThrow(/unavailable/i)
})
