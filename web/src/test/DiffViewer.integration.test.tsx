import { DiffFile as CoreDiffFile } from '@git-diff-view/core'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { expect, test } from 'vitest'

import type { DiffFile } from '../api/types'
import { DiffViewer } from '../review/DiffViewer'
import { TestProviders } from './fixtures'

const file: DiffFile = {
  old_path: 'src/parser.py',
  new_path: 'src/parser.py',
  diff: '@@ -1 +1 @@\n-old value\n+new value',
  new_file: false,
  renamed_file: false,
  deleted_file: false,
  collapsed: false,
  too_large: false,
}

test('keeps the real diff widget mounted after selecting a line', async () => {
  render(<DiffViewer file={file} />, { wrapper: TestProviders })

  const addButtons = await screen.findAllByRole('button', {
    name: /Comment on (old|new) line 1/,
  })
  fireEvent.mouseDown(addButtons[0])

  expect(await screen.findByLabelText('Comment')).toBeVisible()
})

test('reconstructs worker-processed bundles in the real renderer', async () => {
  const originalWorker = globalThis.Worker

  class WorkerStub {
    onmessage:
      | ((event: MessageEvent<{ bundle: unknown }>) => void)
      | null = null
    onerror: (() => void) | null = null

    postMessage(request: {
      data: Parameters<typeof CoreDiffFile.createInstance>[0]
      theme: 'light' | 'dark'
    }) {
      const parsed = CoreDiffFile.createInstance(request.data)
      parsed.initTheme(request.theme)
      parsed.initRaw()
      parsed.buildSplitDiffLines()
      parsed.buildUnifiedDiffLines()
      const bundle = structuredClone(parsed._getFullBundle())
      queueMicrotask(() => {
        this.onmessage?.(
          new MessageEvent('message', { data: { bundle } }),
        )
      })
    }

    terminate() {}
  }

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: WorkerStub,
    writable: true,
  })

  try {
    render(<DiffViewer file={file} />, { wrapper: TestProviders })
    await waitFor(() => {
      const content = Array.from(
        document.querySelectorAll('.diff-line-content-raw'),
      ).map((element) => element.textContent)
      expect(content).toEqual(['old value', 'new value'])
    })
    await waitFor(() => {
      expect(
        document.querySelector('[data-component="git-diff-view"]'),
      ).toHaveAttribute('data-highlighter', 'lowlight')
    })
  } finally {
    if (originalWorker) {
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        value: originalWorker,
        writable: true,
      })
    } else {
      delete (globalThis as { Worker?: unknown }).Worker
    }
  }
})
