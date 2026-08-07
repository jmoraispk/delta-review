import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test, vi } from 'vitest'

import { createFakeBrowser } from '../test/fakeBrowser'
import { server } from '../test/server'

const fake = createFakeBrowser()
vi.mock('webextension-polyfill', () => ({ default: fake }))

const { saveHost } = await import('./hosts')
const { handleMessage, scrubToken } = await import('./router')

// The msw server lifecycle (listen/resetHandlers/close) is owned by
// src/test/setup.ts. Standing up a second setupServer() here would make every
// request resolver run twice.
const BASE = 'https://gitlab.example.com/api/v4'
const TARGET = { hostId: 'gitlab.example.com', project: 'p', iid: 1 }

beforeEach(async () => {
  fake.reset()
  await saveHost(
    {
      id: 'gitlab.example.com',
      host: 'gitlab.example.com',
      apiBase: BASE,
      userId: 7,
      username: 'joao',
    },
    'secret-token',
  )
})

test('dispatches a review op', async () => {
  server.use(
    http.get(`${BASE}/projects/p/merge_requests/1`, () =>
      HttpResponse.json({ iid: 1, title: 'x' }),
    ),
  )
  await expect(
    handleMessage({ kind: 'delta/review', op: 'getMergeRequest', target: TARGET }),
  ).resolves.toMatchObject({ ok: true, data: { iid: 1 } })
})

test('getConfig is answered from the stored host', async () => {
  await expect(
    handleMessage({ kind: 'delta/review', op: 'getConfig', target: TARGET }),
  ).resolves.toEqual({
    ok: true,
    data: { host: 'gitlab.example.com', project: 'p', mr_iid: 1 },
  })
})

test('an unknown host is a structured error, not a throw', async () => {
  await expect(
    handleMessage({
      kind: 'delta/review',
      op: 'getDiffs',
      target: { ...TARGET, hostId: 'nope' },
    }),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: 'host_not_configured', status: 400 },
  })
})

test('a GitLab error becomes the shared envelope', async () => {
  server.use(
    http.get(`${BASE}/projects/p/merge_requests/1`, () =>
      HttpResponse.json({ message: 'nope' }, { status: 401 }),
    ),
  )
  await expect(
    handleMessage({ kind: 'delta/review', op: 'getMergeRequest', target: TARGET }),
  ).resolves.toEqual({
    ok: false,
    error: {
      code: 'gitlab_authentication_failed',
      message: 'nope',
      status: 401,
    },
  })
})

test('the token is scrubbed out of error text', async () => {
  server.use(
    http.get(`${BASE}/projects/p/merge_requests/1`, () =>
      HttpResponse.json(
        { message: 'bad header PRIVATE-TOKEN=secret-token' },
        { status: 400 },
      ),
    ),
  )
  const response = await handleMessage({
    kind: 'delta/review',
    op: 'getMergeRequest',
    target: TARGET,
  })
  expect(JSON.stringify(response)).not.toContain('secret-token')
  expect(JSON.stringify(response)).toContain('[redacted]')
})

test('scrubToken is a no-op without a token', () => {
  expect(scrubToken('hello', null)).toBe('hello')
  expect(scrubToken('hello', '')).toBe('hello')
})

test('listHosts never returns a token', async () => {
  const response = await handleMessage({ kind: 'delta/hub', op: 'listHosts' })
  expect(JSON.stringify(response)).not.toContain('secret-token')
})

test('a revoked host permission is reported, not fetched blindly', async () => {
  fake.granted.clear()
  await expect(
    handleMessage({ kind: 'delta/hub', op: 'listMergeRequests' }),
  ).resolves.toMatchObject({
    ok: true,
    data: [{ hostId: 'gitlab.example.com', error: 'permission_missing' }],
  })
})

test('a permitted host is fetched', async () => {
  fake.granted.add('https://gitlab.example.com/*')
  server.use(http.get(`${BASE}/merge_requests`, () => HttpResponse.json([])))
  await expect(
    handleMessage({ kind: 'delta/hub', op: 'listMergeRequests' }),
  ).resolves.toMatchObject({
    ok: true,
    data: [{ hostId: 'gitlab.example.com', reviewing: { items: [] } }],
  })
})

test('an unknown op is rejected', async () => {
  await expect(
    handleMessage({
      kind: 'delta/review',
      op: 'nope' as never,
      target: TARGET,
    }),
  ).resolves.toMatchObject({ ok: false, error: { code: 'unknown_op' } })
})
