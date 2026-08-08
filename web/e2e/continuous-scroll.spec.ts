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

function makeFiles(count: number, lines: number): DiffFile[] {
  return Array.from({ length: count }, (_, index) => ({
    old_path: `src/area-${index % 10}/file-${index}.ts`,
    new_path: `src/area-${index % 10}/file-${index}.ts`,
    diff: [
      `@@ -0,0 +1,${lines} @@`,
      ...Array.from(
        { length: lines },
        (_, line) => `+const v_${index}_${line} = ${line};`,
      ),
    ].join('\n'),
    new_file: true,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }))
}

const files = makeFiles(300, 40)

test.beforeEach(async ({ page }) => {
  const payloads: Record<string, unknown> = {
    '/api/config': { host: 'gitlab.com', project: 'p/q', mr_iid: 1 },
    '/api/mr': {
      iid: 1,
      title: 'Continuous scroll fixture',
      web_url: 'https://gitlab.com/p/q/-/merge_requests/1',
      state: 'opened',
      source_branch: 'work',
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
  await page.goto('/#session=scroll')
  await page.locator('.diff-line').first().waitFor({ state: 'attached' })
})

test('reserves scroll height for every file without rendering them all', async ({
  page,
}) => {
  const main = page.locator('.review-main')

  // The whole merge request is reachable by scrolling.
  const scrollHeight = await main.evaluate((element) => element.scrollHeight)
  expect(scrollHeight).toBeGreaterThan(300 * 400)

  // But only a window of it exists in the DOM.
  await expect(page.locator('.diff-stream-item')).not.toHaveCount(300)
  const rendered = await page.locator('.diff-stream-item').count()
  expect(rendered).toBeLessThan(20)
})

test('scrolling carries on into the next file', async ({ page }) => {
  await expect(
    page.getByRole('heading', { name: files[0].new_path }),
  ).toBeVisible()

  const main = page.locator('.review-main')
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight * 0.02
  })

  const firstPath = files[0].new_path
  await expect
    .poll(async () =>
      main.evaluate(
        (element, path) =>
          [...element.querySelectorAll('.diff-file-name')].some(
            (header) => header.textContent !== path,
          ),
        firstPath,
      ),
    )
    .toBe(true)
})

test('scrolling back up crosses file boundaries too', async ({ page }) => {
  const main = page.locator('.review-main')
  // Read a few files deep so there are sections above to scroll back into.
  for (let step = 0; step < 20; step += 1) {
    await main.evaluate((element) => {
      element.scrollTop += 700
    })
    await page.waitForTimeout(50)
  }
  const deepest = await main.evaluate((element) => element.scrollTop)
  expect(deepest).toBeGreaterThan(10_000)

  // Every upward step must actually move up. Browser scroll anchoring used to
  // throw the view back down whenever a section entered from the top, which
  // trapped the reader at a file boundary.
  const steps: { requested: number; actual: number }[] = []
  for (let step = 0; step < 12; step += 1) {
    const before = await main.evaluate((element) => element.scrollTop)
    await main.evaluate((element) => {
      element.scrollTop -= 700
    })
    await page.waitForTimeout(120)
    const after = await main.evaluate((element) => element.scrollTop)
    steps.push({ requested: before - 700, actual: after })
  }

  for (const { requested, actual } of steps) {
    expect(Math.abs(actual - requested)).toBeLessThan(60)
  }
  expect(steps.at(-1)?.actual).toBeLessThan(deepest - 7_000)
})

test('the rail follows the scroll position', async ({ page }) => {
  await expect(page.locator('.file-row[aria-current="true"]')).toHaveCount(1)

  const main = page.locator('.review-main')
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight * 0.05
  })

  await expect
    .poll(async () =>
      page.locator('.file-row[aria-current="true"]').first().textContent(),
    )
    .not.toContain('file-0.ts')
})

test('selecting in the rail scrolls the stream to that file', async ({
  page,
}) => {
  const rail = page.locator('.file-list-scroll')
  await rail.evaluate((element) => {
    element.scrollTop = 400
  })
  const target = page.locator('.file-row').first()
  const name = (await target.textContent())?.match(/file-\d+\.ts/)?.[0]
  if (!name) throw new Error('no file row to select')
  await target.click()

  await expect
    .poll(async () =>
      page
        .locator('.review-main .diff-file-name')
        .first()
        .textContent()
        .catch(() => ''),
    )
    .toContain(name)
})
