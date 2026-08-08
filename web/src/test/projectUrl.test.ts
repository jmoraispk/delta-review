import { expect, test } from 'vitest'

import { projectUrlFrom } from '../review/projectUrl'

test('derives the project page from a merge request URL', () => {
  expect(
    projectUrlFrom(
      'https://gitlab-master.nvidia.com/gputelecom/aerial_sdk/-/merge_requests/5606',
    ),
  ).toBe('https://gitlab-master.nvidia.com/gputelecom/aerial_sdk')
})

test('keeps nested group paths intact', () => {
  expect(
    projectUrlFrom('https://gitlab.com/group/sub/project/-/merge_requests/7'),
  ).toBe('https://gitlab.com/group/sub/project')
})

test('returns null when the URL is not a merge request', () => {
  expect(projectUrlFrom('https://gitlab.com/group/project')).toBeNull()
  expect(projectUrlFrom('')).toBeNull()
})
