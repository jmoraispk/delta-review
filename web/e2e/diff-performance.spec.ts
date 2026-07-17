import { expect, test } from '@playwright/test'

interface DiffFile {
  old_path: string
  new_path: string
  diff: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
  collapsed: boolean
  too_large: boolean
}

function makeDiff(changedLines: number, fileIndex: number): string {
  const removedCount = Math.floor(changedLines / 2)
  const addedCount = changedLines - removedCount
  const removed = Array.from(
    { length: removedCount },
    (_, line) => `-const old_${fileIndex}_${line} = ${line};`,
  )
  const added = Array.from(
    { length: addedCount },
    (_, line) => `+const new_${fileIndex}_${line} = ${line};`,
  )
  return [
    `@@ -1,${removedCount} +1,${addedCount} @@`,
    ...removed,
    ...added,
  ].join('\n')
}

function makeFiles(): DiffFile[] {
  return Array.from({ length: 50 }, (_, index) => ({
    old_path: `src/file-${String(index).padStart(2, '0')}.ts`,
    new_path: `src/file-${String(index).padStart(2, '0')}.ts`,
    diff: makeDiff(100, index),
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }))
}

test('large review stays responsive while rendering and scrolling', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000)
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  const payloads: Record<string, unknown> = {
    '/api/config': {
      host: 'gitlab.com',
      project: 'public/performance-fixture',
      mr_iid: 42,
    },
    '/api/mr': {
      iid: 42,
      title: 'Delta browser performance fixture',
      web_url:
        'https://gitlab.com/public/performance-fixture/-/merge_requests/42',
      state: 'opened',
      source_branch: 'perf',
      target_branch: 'main',
    },
    '/api/diffs': makeFiles(),
    '/api/discussions': [
      {
        id: 'general-comment',
        notes: [{ id: 1, body: 'General MR comment' }],
      },
      {
        id: 'inline-comment',
        notes: [
          {
            id: 2,
            body: '**Inline review note**',
            position: {
              old_path: 'src/file-00.ts',
              new_path: 'src/file-00.ts',
              new_line: 1,
            },
          },
        ],
      },
    ],
  }

  await page.route('http://127.0.0.1:4173/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const body = payloads[path]
    await route.fulfill({
      body: JSON.stringify(body ?? {}),
      contentType: 'application/json',
      status: body === undefined ? 404 : 200,
    })
  })

  await page.addInitScript(() => {
    const state = {
      firstDiffMs: null as number | null,
      firstHighlighter: null as string | null,
      highlightMs: null as number | null,
      longTasks: [] as number[],
    }
    Object.assign(window, { __deltaPerformance: state })
    new PerformanceObserver((list) => {
      state.longTasks.push(
        ...list.getEntries().map((entry) => entry.duration),
      )
    }).observe({ buffered: true, type: 'longtask' })
    new MutationObserver(() => {
      const root = document.querySelector(
        '[data-component="git-diff-view"]',
      )
      if (!root) return
      if (state.firstDiffMs === null) {
        state.firstDiffMs = performance.now()
        state.firstHighlighter = root.getAttribute('data-highlighter')
      }
      if (
        state.highlightMs === null &&
        root.getAttribute('data-highlighter')
      ) {
        state.highlightMs = performance.now()
      }
    }).observe(document, {
      attributeFilter: ['data-highlighter'],
      attributes: true,
      childList: true,
      subtree: true,
    })
  })

  await page.goto('/#session=benchmark')
  await page
    .locator('.diff-line')
    .first()
    .waitFor({ state: 'attached' })
  expect(browserErrors).toEqual([])
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-component="git-diff-view"]')
        ?.getAttribute('data-highlighter') === 'lowlight',
  )
  await expect(page.getByText('General MR comment')).toHaveCount(0)
  await expect(page.locator('.diff-stage .view-control')).toHaveCount(0)
  await page.getByRole('button', {
    name: 'MR discussions (1)',
  }).click()
  await expect(page.getByText('General MR comment')).toBeVisible()
  await page
    .getByRole('region', { name: 'MR discussions' })
    .getByRole('button', { name: 'Close' })
    .click()
  await expect(page.getByText('General MR comment')).toHaveCount(0)
  const showComments = page.getByRole('button', {
    name: 'Show inline comments (1)',
  })
  await expect(showComments).toBeVisible()
  await showComments.click()
  await expect(page.getByText('Inline review note')).toBeVisible()
  await expect(page.getByText('Inline review note')).toHaveJSProperty(
    'tagName',
    'STRONG',
  )
  await page.getByRole('button', {
    name: 'Hide inline comments (1)',
  }).click()
  await expect(page.getByText('Inline review note')).toHaveCount(0)
  await page.getByRole('button', { name: 'Split' }).click()
  await expect(page.locator('.split-diff-view')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Split' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Unified' }).click()
  await expect(page.locator('.unified-diff-view')).toBeVisible()

  const coldOpenMs = await page.evaluate(() => performance.now())
  await page.evaluate(() => {
    const state = window as typeof window & {
      __deltaStaleFile?: boolean
    }
    state.__deltaStaleFile = false
    new MutationObserver(() => {
      const section = document.querySelector<HTMLElement>('.diff-stage')
      if (
        section?.getAttribute('aria-label') === 'src/file-01.ts' &&
        section.textContent?.includes('old_0_')
      ) {
        state.__deltaStaleFile = true
      }
    }).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    })
  })
  await page.locator('[data-file-index="1"]').click()
  await page
    .locator(
      'section[aria-label="src/file-01.ts"] .diff-line',
    )
    .first()
    .waitFor({ state: 'attached' })
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __deltaStaleFile?: boolean
          }
        ).__deltaStaleFile,
    ),
  ).toBe(false)
  await page.locator('[data-file-index="0"]').click()
  await page
    .locator(
      'section[aria-label="src/file-00.ts"] .diff-line',
    )
    .first()
    .waitFor({ state: 'attached' })

  const cachedSwitchMs = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const button = document.querySelector<HTMLButtonElement>(
          '[data-file-index="1"]',
        )
        if (!button) {
          reject(new Error('Cached file button is missing'))
          return
        }
        const started = performance.now()
        const observer = new MutationObserver(() => {
          const stage = document.querySelector(
            'section[aria-label="src/file-01.ts"]',
          )
          if (!stage?.textContent?.includes('old_1_0')) return
          observer.disconnect()
          requestAnimationFrame(() =>
            resolve(performance.now() - started),
          )
        })
        observer.observe(document, { childList: true, subtree: true })
        button.click()
        window.setTimeout(() => {
          observer.disconnect()
          reject(new Error('Cached file did not render'))
        }, 5_000)
      }),
  )

  await page.locator('[data-file-index="0"]').click()
  await page
    .locator(
      'section[aria-label="src/file-00.ts"] .diff-line',
    )
    .first()
    .waitFor({ state: 'attached' })
  await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __deltaPerformance: { longTasks: number[] }
      }
    ).__deltaPerformance
    state.longTasks = []
    const reviewMain = document.querySelector<HTMLElement>('.review-main')
    if (!reviewMain) throw new Error('Review scroll container is missing')
    reviewMain.scrollTop = 0
  })
  await page.locator('.review-main').hover()
  for (let index = 0; index < 80; index += 1) {
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(250)

  const metrics = await page.evaluate(
    ({ coldOpenMs, cachedSwitchMs }) => {
      const state = (
        window as typeof window & {
          __deltaPerformance: {
            firstDiffMs: number | null
            firstHighlighter: string | null
            highlightMs: number | null
            longTasks: number[]
          }
        }
      ).__deltaPerformance
      return {
        cachedSwitchMs,
        changedFiles: 50,
        changedLines: 5_000,
        coldOpenMs,
        firstDiffMs: state.firstDiffMs,
        firstHighlighter: state.firstHighlighter,
        highlightMs: state.highlightMs,
        maxScrollLongTaskMs: Math.max(0, ...state.longTasks),
        reviewScrollTop:
          document.querySelector<HTMLElement>('.review-main')
            ?.scrollTop ?? 0,
        scrollLongTasksOver100Ms: state.longTasks.filter(
          (duration) => duration > 100,
        ).length,
      }
    },
    { cachedSwitchMs, coldOpenMs },
  )

  const addComment = page.locator('.diff-add-widget').first()
  const commentRow = addComment.locator('xpath=ancestor::tr')
  await commentRow.scrollIntoViewIfNeeded()
  await expect(addComment).toBeHidden()
  await commentRow.hover()
  await expect(addComment).toBeVisible()
  await addComment.click()
  const inlineComposer = page.locator(
    '.diff-line-widget .comment-composer textarea',
  )
  await expect(inlineComposer).toBeVisible()
  await inlineComposer.fill('DeltaReview read-only browser test draft')
  await page
    .locator('.diff-line-widget .comment-composer')
    .getByRole('button', { name: 'Cancel' })
    .click()
  await expect(inlineComposer).toBeHidden()
  expect(browserErrors).toEqual([])

  console.log(`DELTA_PERFORMANCE ${JSON.stringify(metrics)}`)
  await testInfo.attach('performance.json', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  })

  expect(metrics.cachedSwitchMs).toBeLessThan(100)
  expect(metrics.reviewScrollTop).toBeGreaterThan(0)
  expect(metrics.scrollLongTasksOver100Ms).toBe(0)
  expect(metrics.firstHighlighter).toBe('')
  expect(metrics.highlightMs).not.toBeNull()
  expect(metrics.highlightMs).toBeGreaterThanOrEqual(
    metrics.firstDiffMs ?? Number.POSITIVE_INFINITY,
  )
})
