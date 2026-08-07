import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { expect, test, vi } from 'vitest'

import type { DiffFile } from '../api/types'
import { DiffStream } from '../review/DiffStream'
import { TestProviders } from './fixtures'

function file(path: string, lines = 4): DiffFile {
  const body = Array.from({ length: lines }, (_, i) => `+line ${i}`)
  return {
    old_path: path,
    new_path: path,
    diff: [`@@ -0,0 +1,${lines} @@`, ...body].join('\n'),
    new_file: true,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }
}

test('renders a header for every changed file', () => {
  const files = [file('src/a.ts'), file('src/b.ts'), file('src/c.ts')]
  render(
    <DiffStream
      activeIndex={0}
      mode="unified"
      showComments={false}
      files={files}
      scrollRef={createRef<HTMLElement>()}
      onActiveIndexChange={() => undefined}
    />,
    { wrapper: TestProviders },
  )

  for (const path of ['src/a.ts', 'src/b.ts', 'src/c.ts']) {
    expect(screen.getByRole('heading', { name: path })).toBeVisible()
  }
})

test('keeps the rendered file count far below the total', () => {
  const files = Array.from({ length: 300 }, (_, index) =>
    file(`src/file-${index}.ts`, 40),
  )
  render(
    <DiffStream
      activeIndex={0}
      mode="unified"
      showComments={false}
      files={files}
      scrollRef={createRef<HTMLElement>()}
      onActiveIndexChange={() => undefined}
    />,
    { wrapper: TestProviders },
  )

  expect(screen.getAllByRole('heading').length).toBeLessThan(60)
})

test('reserves the full estimated height for the whole merge request', () => {
  const files = Array.from({ length: 50 }, (_, index) =>
    file(`src/file-${index}.ts`, 100),
  )
  const { container } = render(
    <DiffStream
      activeIndex={0}
      mode="unified"
      showComments={false}
      files={files}
      scrollRef={createRef<HTMLElement>()}
      onActiveIndexChange={() => undefined}
    />,
    { wrapper: TestProviders },
  )

  const stream = container.querySelector<HTMLElement>('.diff-stream')
  expect(Number.parseInt(stream?.style.height ?? '0', 10)).toBeGreaterThan(
    50 * 100 * 10,
  )
})

test('leaves the review controls to the header', () => {
  const files = [file('src/a.ts'), file('src/b.ts')]
  render(
    <DiffStream
      activeIndex={0}
      mode="unified"
      showComments={false}
      files={files}
      scrollRef={createRef<HTMLElement>()}
      onActiveIndexChange={() => undefined}
    />,
    { wrapper: TestProviders },
  )

  expect(
    screen.queryByRole('toolbar', { name: 'Review controls' }),
  ).toBeNull()
})

// Scroll-driven reporting needs real layout, so it is covered by
// e2e/continuous-scroll.spec.ts rather than jsdom.
test('reports the topmost rendered file as active', () => {
  const onActiveIndexChange = vi.fn()
  const files = Array.from({ length: 20 }, (_, index) =>
    file(`src/file-${index}.ts`, 30),
  )

  render(
    <DiffStream
      activeIndex={7}
      mode="unified"
      showComments={false}
      files={files}
      scrollRef={createRef<HTMLElement>()}
      onActiveIndexChange={onActiveIndexChange}
    />,
    { wrapper: TestProviders },
  )

  expect(onActiveIndexChange).toHaveBeenCalledWith(0)
})
