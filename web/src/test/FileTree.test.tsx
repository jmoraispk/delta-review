import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import type { DiffFile } from '../api/types'
import { FileTree } from '../review/FileTree'

const files: DiffFile[] = [
  {
    old_path: 'a.py',
    new_path: 'a.py',
    diff: '@@ -1 +1,2 @@\n-old\n+new\n+more',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  },
  {
    old_path: 'b.py',
    new_path: 'b.py',
    diff: '@@',
    new_file: true,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  },
]

test('keyboard navigation changes files and focuses the diff', () => {
  const onSelect = vi.fn()
  const onFocusDiff = vi.fn()
  render(
    <FileTree
      files={files}
      activeIndex={0}
      onSelect={onSelect}
      onFocusDiff={onFocusDiff}
    />,
  )

  const activeFile = screen.getByRole('button', { name: /^a\.py/ })
  fireEvent.keyDown(activeFile, { key: 'ArrowDown' })
  expect(onSelect).toHaveBeenCalledWith(1)

  fireEvent.keyDown(activeFile, { key: 'Enter' })
  expect(onFocusDiff).toHaveBeenCalledOnce()
})

test('shows additions and deletions for each file', () => {
  render(
    <FileTree
      files={files}
      activeIndex={0}
      onSelect={() => undefined}
      onFocusDiff={() => undefined}
    />,
  )

  expect(
    screen.getByRole('button', {
      name: /a\.py.*2 additions.*1 deletion/i,
    }),
  ).toBeVisible()
})

const nestedFiles: DiffFile[] = [
  { ...files[0], old_path: 'src/py6g/a.py', new_path: 'src/py6g/a.py' },
  { ...files[1], old_path: 'src/py6g/b.py', new_path: 'src/py6g/b.py' },
  { ...files[0], old_path: 'docs/guide.md', new_path: 'docs/guide.md' },
]

test('groups files under collapsible directories', () => {
  render(
    <FileTree
      files={nestedFiles}
      activeIndex={0}
      onSelect={() => undefined}
      onFocusDiff={() => undefined}
    />,
  )

  const directory = screen.getByRole('button', { name: /src\/py6g/ })
  expect(directory).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /^a\.py/ })).toBeVisible()

  fireEvent.click(directory)

  expect(directory).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: /^a\.py/ })).toBeNull()
  expect(screen.getByRole('button', { name: /guide\.md/ })).toBeVisible()
})

test('reopens a directory that hides the active file', () => {
  const { rerender } = render(
    <FileTree
      files={nestedFiles}
      activeIndex={2}
      onSelect={() => undefined}
      onFocusDiff={() => undefined}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: /src\/py6g/ }))
  expect(screen.queryByRole('button', { name: /^a\.py/ })).toBeNull()

  rerender(
    <FileTree
      files={nestedFiles}
      activeIndex={0}
      onSelect={() => undefined}
      onFocusDiff={() => undefined}
    />,
  )

  expect(screen.getByRole('button', { name: /^a\.py/ })).toBeVisible()
})

test('labels each file with its change status', () => {
  render(
    <FileTree
      files={files}
      activeIndex={0}
      onSelect={() => undefined}
      onFocusDiff={() => undefined}
    />,
  )

  expect(
    screen.getByRole('button', { name: /^a\.py.*modified/i }),
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: /^b\.py.*added/i }),
  ).toBeVisible()
})

test('keeps large file lists virtualized', () => {
  const manyFiles = Array.from({ length: 2_000 }, (_, index) => ({
    ...files[0],
    old_path: `src/file-${index}.py`,
    new_path: `src/file-${index}.py`,
  }))
  render(
    <FileTree
      files={manyFiles}
      activeIndex={0}
      onSelect={() => undefined}
      onFocusDiff={() => undefined}
    />,
  )

  expect(screen.getAllByRole('button').length).toBeLessThan(100)
  expect(screen.queryByText('src/file-1999.py')).not.toBeInTheDocument()
})
