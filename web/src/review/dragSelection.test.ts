import { beforeEach, expect, test } from 'vitest'

import {
  clearDragHighlight,
  dragTargetFromElement,
  findCommentButton,
  highlightDragRange,
} from './dragSelection'

beforeEach(() => {
  document.body.innerHTML = `
    <div id="diff">
      <div class="diff-line" data-state="diff">
        <div class="diff-line-num">
          <span data-line-old-num="10">10</span>
          <span data-line-new-num="12">12</span>
          <div data-add-widget="new"><button type="button">+</button></div>
        </div>
      </div>
      <div class="diff-line" data-state="diff">
        <div class="diff-line-num">
          <span data-line-new-num="13">13</span>
          <div data-add-widget="new"><button type="button">+</button></div>
        </div>
      </div>
      <div class="diff-line" data-state="diff">
        <div class="diff-line-num">
          <span data-line-new-num="14">14</span>
          <div data-add-widget="new"><button type="button">+</button></div>
        </div>
      </div>
    </div>
  `
})

test('reads a selectable side and line from the number gutter', () => {
  const marker = document.querySelector('[data-line-new-num="12"]')

  expect(dragTargetFromElement(marker)).toEqual({
    lineNumber: 12,
    side: 'new',
  })
  expect(
    dragTargetFromElement(document.querySelector('.diff-line')),
  ).toBeNull()
})

test('highlights reverse ranges and locates the endpoint comment button', () => {
  const root = document.querySelector<HTMLElement>('#diff')
  if (!root) throw new Error('fixture root is missing')

  highlightDragRange(
    root,
    { lineNumber: 14, side: 'new' },
    { lineNumber: 12, side: 'new' },
  )

  expect(root.querySelectorAll('.delta-drag-selected')).toHaveLength(3)
  expect(
    findCommentButton(root, { lineNumber: 14, side: 'new' }),
  ).toBe(root.querySelector('[data-line-new-num="14"]')?.parentElement
    ?.querySelector('button'))

  clearDragHighlight(root)
  expect(root.querySelectorAll('.delta-drag-selected')).toHaveLength(0)
})

test('selects line-number ranges on one side of a split diff', () => {
  document.body.innerHTML = `
    <div id="diff">
      ${[1, 2, 3]
        .map(
          (line) => `
            <div class="diff-line" data-state="diff" data-side="old">
              <div class="diff-line-old-num">
                <span data-line-num="${line}">${line}</span>
                <div data-add-widget="old"><button type="button">+</button></div>
              </div>
            </div>
          `,
        )
        .join('')}
      <div class="diff-line" data-state="diff" data-side="new">
        <div class="diff-line-new-num">
          <span data-line-num="1">1</span>
        </div>
      </div>
    </div>
  `
  const root = document.querySelector<HTMLElement>('#diff')
  const marker = document.querySelector('[data-side="old"] [data-line-num="3"]')
  if (!root) throw new Error('fixture root is missing')

  expect(dragTargetFromElement(marker)).toEqual({
    lineNumber: 3,
    side: 'old',
  })
  expect(dragTargetFromElement(marker?.parentElement ?? null)).toEqual({
    lineNumber: 3,
    side: 'old',
  })
  expect(
    dragTargetFromElement(root.querySelector('button')),
  ).toBeNull()
  highlightDragRange(
    root,
    { lineNumber: 3, side: 'old' },
    { lineNumber: 1, side: 'old' },
  )

  expect(root.querySelectorAll('.delta-drag-selected')).toHaveLength(3)
  expect(
    findCommentButton(root, { lineNumber: 3, side: 'old' }),
  ).not.toBeNull()
})
