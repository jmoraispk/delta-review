import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import type { DiffFile } from '../api/types'
import { FileTree } from '../review/FileTree'

const files: DiffFile[] = [
  {
    old_path: 'a.py',
    new_path: 'a.py',
    diff: '@@',
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

  const activeFile = screen.getByRole('button', { name: 'a.py' })
  fireEvent.keyDown(activeFile, { key: 'ArrowDown' })
  expect(onSelect).toHaveBeenCalledWith(1)

  fireEvent.keyDown(activeFile, { key: 'Enter' })
  expect(onFocusDiff).toHaveBeenCalledOnce()
})
