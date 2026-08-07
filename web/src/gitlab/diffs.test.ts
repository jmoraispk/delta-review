import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'

import { server } from '../test/server'
import { GitLabClient } from './client'
import { getDiffs, getMergeRequest, mergeRequestPath } from './diffs'

// The msw server lifecycle (listen/resetHandlers/close) is owned by
// src/test/setup.ts. Standing up a second setupServer() here would make every
// request resolver run twice.
const BASE = 'https://gitlab.example.com/api/v4'
const MR = `${BASE}/projects/platform%2Fdelta-review/merge_requests/42`
const client = () => new GitLabClient(BASE, 'token')

const FILE = {
  old_path: 'src/parser.py',
  new_path: 'src/parser.py',
  diff: '@@ -1 +1 @@\n-old\n+new',
}

test('encodes the project path', () => {
  expect(mergeRequestPath('platform/delta-review', 42)).toBe(
    '/projects/platform%2Fdelta-review/merge_requests/42',
  )
})

test('reads the merge request', async () => {
  server.use(http.get(MR, () => HttpResponse.json({ iid: 42 })))
  await expect(
    getMergeRequest(client(), 'platform/delta-review', 42),
  ).resolves.toMatchObject({ iid: 42 })
})

test('reads diffs from the paginated endpoint', async () => {
  server.use(
    http.get(`${MR}/diffs`, () =>
      HttpResponse.json([FILE], { headers: { 'x-next-page': '' } }),
    ),
  )
  const files = await getDiffs(client(), 'platform/delta-review', 42)
  expect(files).toHaveLength(1)
  expect(files[0]).toMatchObject({ new_path: 'src/parser.py', new_file: false })
})

test('falls back to changes when diffs 404s', async () => {
  server.use(
    http.get(`${MR}/diffs`, () => HttpResponse.json({}, { status: 404 })),
    http.get(`${MR}/changes`, () =>
      HttpResponse.json({ overflow: false, changes: [FILE] }),
    ),
  )
  await expect(
    getDiffs(client(), 'platform/delta-review', 42),
  ).resolves.toHaveLength(1)
})

test('retries changes with raw diffs on overflow', async () => {
  const seen: string[] = []
  server.use(
    http.get(`${MR}/diffs`, () => HttpResponse.json({}, { status: 500 })),
    http.get(`${MR}/changes`, ({ request }) => {
      const raw = new URL(request.url).searchParams.get('access_raw_diffs')
      seen.push(raw ?? 'absent')
      return HttpResponse.json(
        raw === 'true'
          ? { overflow: false, changes: [FILE] }
          : { overflow: true, changes: [] },
      )
    }),
  )
  await expect(
    getDiffs(client(), 'platform/delta-review', 42),
  ).resolves.toHaveLength(1)
  expect(seen).toEqual(['absent', 'true'])
})

test('throws diff_truncated when overflow persists', async () => {
  server.use(
    http.get(`${MR}/diffs`, () => HttpResponse.json({}, { status: 500 })),
    http.get(`${MR}/changes`, () =>
      HttpResponse.json({ overflow: true, changes: [] }),
    ),
  )
  await expect(
    getDiffs(client(), 'platform/delta-review', 42),
  ).rejects.toMatchObject({ code: 'diff_truncated', status: 422 })
})

test('does not swallow a 403 from diffs', async () => {
  server.use(
    http.get(`${MR}/diffs`, () => HttpResponse.json({}, { status: 403 })),
  )
  await expect(
    getDiffs(client(), 'platform/delta-review', 42),
  ).rejects.toMatchObject({ code: 'gitlab_access_denied' })
})
