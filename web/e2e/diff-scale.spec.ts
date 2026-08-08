import { expect, test } from '@playwright/test'

// Guards the review pane at a merge request far larger than typical: 300
// changed files. Prints its measurements so a threshold failure is
// diagnosable without a rerun.

interface BenchFile {
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
  return [
    `@@ -1,${removedCount} +1,${addedCount} @@`,
    ...Array.from(
      { length: removedCount },
      (_, line) => `-const old_${fileIndex}_${line} = ${line};`,
    ),
    ...Array.from(
      { length: addedCount },
      (_, line) => `+const new_${fileIndex}_${line} = ${line};`,
    ),
  ].join('\n')
}

function makeFiles(count: number, linesPerFile: number): BenchFile[] {
  return Array.from({ length: count }, (_, index) => ({
    old_path: `src/area-${index % 20}/module-${index % 7}/file-${index}.ts`,
    new_path: `src/area-${index % 20}/module-${index % 7}/file-${index}.ts`,
    diff: makeDiff(linesPerFile, index),
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }))
}

const FILE_COUNT = Number(process.env.BENCH_FILES ?? 300)
const LINES = Number(process.env.BENCH_LINES ?? 120)

/**
 * The rail is a virtualized tree, so a row only exists once scrolled near.
 * Scan from the top until it mounts; the scan is deliberately outside any
 * measured window.
 */
async function revealRow(page: import('@playwright/test').Page, name: string) {
  const rail = page.locator('.file-list-scroll')
  const row = page.locator('.file-row').filter({ hasText: name }).first()
  await rail.evaluate((element) => {
    element.scrollTop = 0
  })
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if ((await row.count()) > 0) return row
    await rail.evaluate((element) => {
      element.scrollTop += 300
    })
    await page.waitForTimeout(15)
  }
  throw new Error(`row ${name} never appeared in the rail`)
}

test('a 300 file review loads, scrolls, and jumps without stalling', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const files = makeFiles(FILE_COUNT, LINES)
  const payloadBytes = JSON.stringify(files).length
  const payloads: Record<string, unknown> = {
    '/api/config': {
      host: 'gitlab.com',
      project: 'public/performance-fixture',
      mr_iid: 42,
    },
    '/api/mr': {
      iid: 42,
      title: 'Delta scale benchmark',
      web_url: 'https://gitlab.com/x/-/merge_requests/42',
      state: 'opened',
      source_branch: 'perf',
      target_branch: 'main',
    },
    '/api/diffs': files,
    '/api/discussions': [],
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
    const state = { longTasks: [] as number[] }
    Object.assign(window, { __bench: state })
    new PerformanceObserver((list) => {
      state.longTasks.push(...list.getEntries().map((entry) => entry.duration))
    }).observe({ buffered: true, type: 'longtask' })
  })

  const navStart = Date.now()
  await page.goto('/#session=benchmark')
  await page.locator('.diff-line').first().waitFor({ state: 'attached' })
  const firstDiffMs = Date.now() - navStart
  const loadTasks = await page.evaluate(
    () => (window as unknown as { __bench: { longTasks: number[] } }).__bench
      .longTasks,
  )

  // Reading straight down the stream, the way a review actually goes.
  const main = page.locator('.review-main')
  await page.evaluate(() => {
    ;(
      window as unknown as { __bench: { longTasks: number[] } }
    ).__bench.longTasks.length = 0
  })
  for (let step = 1; step <= 30; step += 1) {
    await main.evaluate((element, index) => {
      element.scrollTop = element.scrollHeight * (index / 40)
    }, step)
    await page.waitForTimeout(40)
  }
  const scrollTasks = await page.evaluate(
    () => (window as unknown as { __bench: { longTasks: number[] } }).__bench
      .longTasks,
  )

  // Jumping to a file from the rail.
  const jumpTimes: number[] = []
  for (const fileIndex of [7, 120, 44, 260, 15]) {
    const target = files[fileIndex].new_path.split('/').pop() as string
    const row = await revealRow(page, target)
    const started = Date.now()
    await row.click()
    await page
      .locator(`.diff-line:has-text("new_${fileIndex}_1 ")`)
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 })
    jumpTimes.push(Date.now() - started)
  }

  const renderedSections = await page.locator('.diff-stream-item').count()
  const memory = await page.evaluate(
    () =>
      (performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize ?? 0,
  )
  const sortedJumps = [...jumpTimes].sort((a, b) => a - b)
  const report = {
    files: FILE_COUNT,
    payloadMB: +(payloadBytes / 1048576).toFixed(2),
    firstDiffMs,
    loadBlockingMs: Math.round(loadTasks.reduce((a, b) => a + b, 0)),
    scrollLongTasks: scrollTasks.length,
    scrollLongTaskMaxMs: Math.round(Math.max(0, ...scrollTasks)),
    jumpMedianMs: sortedJumps[Math.floor(sortedJumps.length / 2)],
    jumpMaxMs: Math.max(...jumpTimes),
    renderedSections,
    heapMB: +(memory / 1048576).toFixed(1),
  }
  console.log('BENCH ' + JSON.stringify(report, null, 2))

  expect(report.files).toBe(FILE_COUNT)
  // Only a window of the review is ever in the DOM.
  expect(report.renderedSections).toBeLessThan(20)
  // Building a section's diff as it scrolls in is the remaining main-thread
  // cost, observed around 130ms. This bounds a real regression without
  // failing on the spread between runs.
  expect(report.scrollLongTaskMaxMs).toBeLessThan(250)
  expect(report.jumpMedianMs).toBeLessThan(1_500)
  expect(report.heapMB).toBeLessThan(400)
})
