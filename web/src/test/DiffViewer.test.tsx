import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import type { DiffFile } from '../api/types'
import { DiffViewer } from '../review/DiffViewer'

vi.mock('@git-diff-view/react', () => {
  const MockDiffView = forwardRef(
    (
      {
        onAddWidgetClick,
      }: {
        onAddWidgetClick?: (lineNumber: number, side: number) => void
      },
      ref,
    ) => {
      useImperativeHandle(ref, () => ({
        getDiffFileInstance: () => null,
      }))
      return (
        <div>
          <button
            type="button"
            onClick={() => onAddWidgetClick?.(12, 2)}
          >
            Comment line 12
          </button>
          <button
            type="button"
            onClick={() => onAddWidgetClick?.(14, 2)}
          >
            Comment line 14
          </button>
        </div>
      )
    },
  )
  return {
    DiffModeEnum: { Split: 3, Unified: 4 },
    DiffView: MockDiffView,
    SplitSide: { old: 1, new: 2 },
  }
})

const FILE: DiffFile = {
  old_path: 'src/parser.py',
  new_path: 'src/parser.py',
  diff: '@@ -12 +12,3 @@\n-old\n+new',
  new_file: false,
  renamed_file: false,
  deleted_file: false,
  collapsed: false,
  too_large: false,
}

beforeEach(() => localStorage.clear())

test('toggles and persists split view', async () => {
  const user = userEvent.setup()
  render(<DiffViewer file={FILE} />)

  await user.click(screen.getByRole('button', { name: 'Split' }))

  expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(localStorage.getItem('delta-diff-mode')).toBe('split')
})

test('opens a line selection and extends it with shift-click', () => {
  render(<DiffViewer file={FILE} />)

  fireEvent.click(screen.getByRole('button', { name: 'Comment line 12' }))
  fireEvent.click(screen.getByRole('button', { name: 'Comment line 14' }), {
    shiftKey: true,
  })

  expect(screen.getByText('Selected lines 12–14')).toBeVisible()
})

test('clears selection when the active file changes', () => {
  const { rerender } = render(<DiffViewer file={FILE} />)
  fireEvent.click(screen.getByRole('button', { name: 'Comment line 12' }))
  expect(screen.getByText('Selected line 12')).toBeVisible()

  rerender(
    <DiffViewer
      file={{ ...FILE, old_path: 'b.py', new_path: 'b.py' }}
    />,
  )

  expect(screen.queryByText('Selected line 12')).not.toBeInTheDocument()
})

test('explains files whose diffs cannot be rendered', () => {
  render(<DiffViewer file={{ ...FILE, too_large: true }} />)

  expect(screen.getByText(/too large for GitLab to return/i)).toBeVisible()
})
