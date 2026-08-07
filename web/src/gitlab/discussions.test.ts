import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'

import { server } from '../test/server'
import { GitLabClient } from './client'
import { createInline, getDiscussions, reply, setResolved } from './discussions'

// The msw server lifecycle (listen/resetHandlers/close) is owned by
// src/test/setup.ts. Standing up a second setupServer() here would make every
// request resolver run twice.
const BASE = 'https://gitlab.example.com/api/v4'
const MR = `${BASE}/projects/p/merge_requests/1`
const client = () => new GitLabClient(BASE, 'token')

const VERSIONS = [
  {
    base_commit_sha: 'base',
    start_commit_sha: 'start',
    head_commit_sha: 'head',
  },
]

const MULTILINE = {
  old_path: 'a.py',
  new_path: 'a.py',
  start_old: null,
  start_new: 10,
  end_old: null,
  end_new: 12,
}

const INLINE_DISCUSSION = {
  id: 'd1',
  notes: [{ id: 1, body: 'hi', position: { new_path: 'a.py' } }],
}
const GENERAL_DISCUSSION = { id: 'd2', notes: [{ id: 2, body: 'hi' }] }

function versionsHandler() {
  return http.get(`${MR}/versions`, () => HttpResponse.json(VERSIONS))
}

test('lists discussions across pages', async () => {
  server.use(
    http.get(`${MR}/discussions`, () =>
      HttpResponse.json([INLINE_DISCUSSION], { headers: { 'x-next-page': '' } }),
    ),
  )
  await expect(getDiscussions(client(), 'p', 1)).resolves.toEqual([
    INLINE_DISCUSSION,
  ])
})

test('a merge request with no version is a 409', async () => {
  server.use(http.get(`${MR}/versions`, () => HttpResponse.json([])))
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).rejects.toMatchObject({ status: 409 })
})

test('the happy path reports inline placement and no fallback', async () => {
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, () =>
      HttpResponse.json(INLINE_DISCUSSION, { status: 201 }),
    ),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).resolves.toMatchObject({ placement: 'inline', fallback: 'none' })
})

test('falls back through legacy, last line, then general', async () => {
  const bodies: unknown[] = []
  let attempt = 0
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, async ({ request }) => {
      bodies.push(await request.json())
      attempt += 1
      if (attempt <= 3) return HttpResponse.json({}, { status: 400 })
      return HttpResponse.json(GENERAL_DISCUSSION, { status: 201 })
    }),
  )
  const result = await createInline(client(), 'p', 1, MULTILINE, 'body')
  expect(result).toMatchObject({ placement: 'general', fallback: 'general' })
  expect(attempt).toBe(4)
  expect(bodies[3]).toMatchObject({ body: '📍 a.py:10-12\n\nbody' })
  expect(bodies[3]).not.toHaveProperty('position')
})

test('stops at the last-line attempt when it succeeds', async () => {
  let attempt = 0
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, () => {
      attempt += 1
      if (attempt <= 2) return HttpResponse.json({}, { status: 422 })
      return HttpResponse.json(INLINE_DISCUSSION, { status: 201 })
    }),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).resolves.toMatchObject({ placement: 'inline', fallback: 'final_line' })
  expect(attempt).toBe(3)
})

test('a single-line selection skips straight to general', async () => {
  let attempt = 0
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, () => {
      attempt += 1
      if (attempt === 1) return HttpResponse.json({}, { status: 400 })
      return HttpResponse.json(GENERAL_DISCUSSION, { status: 201 })
    }),
  )
  const single = { ...MULTILINE, start_new: 12, end_new: 12 }
  await expect(
    createInline(client(), 'p', 1, single, 'body'),
  ).resolves.toMatchObject({ fallback: 'general' })
  expect(attempt).toBe(2)
})

test('a 403 while posting is not swallowed by the ladder', async () => {
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, () => HttpResponse.json({}, { status: 403 })),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).rejects.toMatchObject({ code: 'gitlab_access_denied' })
})

test('an inline post that GitLab silently degrades reports general', async () => {
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, () =>
      HttpResponse.json(GENERAL_DISCUSSION, { status: 201 }),
    ),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).resolves.toMatchObject({ placement: 'general', fallback: 'general' })
})

test('reply and setResolved encode the discussion id', async () => {
  server.use(
    http.post(`${MR}/discussions/a%2Fb/notes`, () =>
      HttpResponse.json({ id: 9 }, { status: 201 }),
    ),
    http.put(`${MR}/discussions/a%2Fb`, () => HttpResponse.json({ id: 'a/b' })),
  )
  await expect(reply(client(), 'p', 1, 'a/b', 'x')).resolves.toMatchObject({
    id: 9,
  })
  await expect(
    setResolved(client(), 'p', 1, 'a/b', true),
  ).resolves.toMatchObject({ id: 'a/b' })
})

test('an empty discussion id is rejected before any request', async () => {
  await expect(reply(client(), 'p', 1, '  ', 'x')).rejects.toThrow(
    /discussionId/,
  )
})

// The tests below cover assertions tests/test_discussions.py makes that the
// ladder tests above do not: the legacy rung succeeding, the payload shape of
// each retried position, the single-line marker, and the two "no extra POST"
// guarantees.

test('stops at the legacy position and still reports no fallback', async () => {
  const bodies: unknown[] = []
  let attempt = 0
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, async ({ request }) => {
      bodies.push(await request.json())
      attempt += 1
      if (attempt === 1) return HttpResponse.json({}, { status: 422 })
      return HttpResponse.json(INLINE_DISCUSSION, { status: 201 })
    }),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).resolves.toMatchObject({ placement: 'inline', fallback: 'none' })
  expect(attempt).toBe(2)
  // The legacy payload stringifies every line number and keeps the range.
  expect(bodies[1]).toMatchObject({
    position: {
      new_line: '12',
      line_range: { start: { new_line: '10' }, end: { new_line: '12' } },
    },
  })
})

test('the last-line retry collapses the range to a single line', async () => {
  const bodies: unknown[] = []
  let attempt = 0
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, async ({ request }) => {
      bodies.push(await request.json())
      attempt += 1
      if (attempt <= 2) return HttpResponse.json({}, { status: 422 })
      return HttpResponse.json(INLINE_DISCUSSION, { status: 201 })
    }),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).resolves.toMatchObject({ fallback: 'final_line' })
  expect(bodies[2]).toMatchObject({ position: { new_line: 12 } })
  expect(bodies[2]).not.toHaveProperty('position.line_range')
})

test('a single-line fallback marker has no range suffix', async () => {
  const bodies: unknown[] = []
  let attempt = 0
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, async ({ request }) => {
      bodies.push(await request.json())
      attempt += 1
      if (attempt === 1) return HttpResponse.json({}, { status: 422 })
      return HttpResponse.json(GENERAL_DISCUSSION, { status: 201 })
    }),
  )
  const single = { ...MULTILINE, start_new: 12, end_new: 12 }
  await expect(
    createInline(client(), 'p', 1, single, 'body'),
  ).resolves.toMatchObject({ placement: 'general', fallback: 'general' })
  expect(bodies[1]).toEqual({ body: '📍 a.py:12\n\nbody' })
})

test('a degraded post is not retried and the version is read once', async () => {
  let versions = 0
  let posts = 0
  let contentType: string | null = null
  let payload = ''
  server.use(
    http.get(`${MR}/versions`, () => {
      versions += 1
      return HttpResponse.json(VERSIONS)
    }),
    http.post(`${MR}/discussions`, async ({ request }) => {
      posts += 1
      contentType = request.headers.get('content-type')
      payload = await request.text()
      return HttpResponse.json(GENERAL_DISCUSSION, { status: 201 })
    }),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).resolves.toMatchObject({ placement: 'general', fallback: 'general' })
  expect(posts).toBe(1)
  expect(versions).toBe(1)
  expect(contentType).toMatch(/^application\/json/)
  expect(payload).not.toBe('')
})

test('a transport failure never posts a general fallback', async () => {
  let posts = 0
  server.use(
    versionsHandler(),
    http.post(`${MR}/discussions`, () => {
      posts += 1
      return HttpResponse.error()
    }),
  )
  await expect(
    createInline(client(), 'p', 1, MULTILINE, 'body'),
  ).rejects.toMatchObject({ code: 'gitlab_unavailable', status: 502 })
  expect(posts).toBe(1)
})
