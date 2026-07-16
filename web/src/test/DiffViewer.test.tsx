import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  forwardRef,
  useImperativeHandle,
  useState,
  type ReactNode,
} from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import type { DiffFile, Discussion } from '../api/types'
import { DiffViewer } from '../review/DiffViewer'
import { TestProviders } from './fixtures'

vi.mock('@git-diff-view/react', () => {
  const MockDiffView = forwardRef(
    (
      {
        onAddWidgetClick,
        extendData,
        renderExtendLine,
        renderWidgetLine,
      }: {
        onAddWidgetClick?: (lineNumber: number, side: number) => void
        extendData?: {
          oldFile?: Record<string, { data: Discussion[] }>
          newFile?: Record<string, { data: Discussion[] }>
        }
        renderExtendLine?: (props: {
          data: Discussion[]
        }) => ReactNode
        renderWidgetLine?: (props: {
          lineNumber: number
          side: number
          onClose: () => void
        }) => ReactNode
      },
      ref,
    ) => {
      const [widget, setWidget] = useState<{
        lineNumber: number
        side: number
      } | null>(null)
      useImperativeHandle(ref, () => ({
        getDiffFileInstance: () => null,
      }))
      return (
        <div>
          <button
            type="button"
            onClick={() => {
              setWidget({ lineNumber: 12, side: 2 })
              onAddWidgetClick?.(12, 2)
            }}
          >
            Comment line 12
          </button>
          <button
            type="button"
            onClick={() => {
              setWidget({ lineNumber: 14, side: 2 })
              onAddWidgetClick?.(14, 2)
            }}
          >
            Comment line 14
          </button>
          {[
            ...Object.values(extendData?.oldFile ?? {}),
            ...Object.values(extendData?.newFile ?? {}),
          ].map((bucket, index) => (
            <div key={index}>
              {renderExtendLine?.({ data: bucket.data })}
            </div>
          ))}
          {widget
            ? renderWidgetLine?.({
                ...widget,
                onClose: () => setWidget(null),
              })
            : null}
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
  render(<DiffViewer file={FILE} />, { wrapper: TestProviders })

  await user.click(screen.getByRole('button', { name: 'Split' }))

  expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(localStorage.getItem('delta-diff-mode')).toBe('split')
})

test('opens a line selection and extends it with shift-click', () => {
  render(<DiffViewer file={FILE} />, { wrapper: TestProviders })

  fireEvent.click(screen.getByRole('button', { name: 'Comment line 12' }))
  fireEvent.click(screen.getByRole('button', { name: 'Comment line 14' }), {
    shiftKey: true,
  })

  expect(screen.getByText(/lines 12–14/)).toBeVisible()
})

test('clears selection when the active file changes', () => {
  const { rerender } = render(<DiffViewer file={FILE} />, {
    wrapper: TestProviders,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Comment line 12' }))
  expect(screen.getByLabelText('Comment')).toBeVisible()

  rerender(
    <DiffViewer
      file={{ ...FILE, old_path: 'b.py', new_path: 'b.py' }}
    />,
  )

  expect(screen.queryByLabelText('Comment')).not.toBeInTheDocument()
})

test('explains files whose diffs cannot be rendered', () => {
  render(<DiffViewer file={{ ...FILE, too_large: true }} />, {
    wrapper: TestProviders,
  })

  expect(screen.getByText(/too large for GitLab to return/i)).toBeVisible()
})

test('groups inline and general discussions around the active diff', () => {
  const discussions: Discussion[] = [
    {
      id: 'inline',
      notes: [
        {
          id: 1,
          body: 'Inline feedback',
          position: {
            old_path: FILE.old_path,
            new_path: FILE.new_path,
            new_line: 12,
          },
        },
      ],
    },
    {
      id: 'general',
      notes: [{ id: 2, body: 'General feedback' }],
    },
  ]
  render(<DiffViewer file={FILE} discussions={discussions} />, {
    wrapper: TestProviders,
  })

  expect(screen.getByText('Inline feedback')).toBeVisible()
  expect(screen.getByText('General feedback')).toBeVisible()
  expect(screen.getByText('General placement')).toBeVisible()
})
