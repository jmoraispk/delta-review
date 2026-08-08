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

const LINE_COUNT = 40

function makeFile(): DiffFile {
  const added = Array.from(
    { length: LINE_COUNT },
    (_, line) => `+const value_${line + 1} = ${line + 1};`,
  )
  return {
    old_path: 'src/sample.ts',
    new_path: 'src/sample.ts',
    diff: [`@@ -0,0 +1,${LINE_COUNT} @@`, ...added].join('\n'),
    new_file: true,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }
}

const payloads: Record<string, unknown> = {
  '/api/config': {
    host: 'gitlab.com',
    project: 'public/fixture',
    mr_iid: 42,
  },
  '/api/mr': {
    iid: 42,
    title: 'Comment selection fixture',
    web_url: 'https://gitlab.com/public/fixture/-/merge_requests/42',
    state: 'opened',
    source_branch: 'work',
    target_branch: 'main',
  },
  '/api/diffs': [makeFile()],
  '/api/discussions': [],
}

test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:4173/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const body = payloads[path]
    await route.fulfill({
      body: JSON.stringify(body ?? {}),
      contentType: 'application/json',
      status: body === undefined ? 404 : 200,
    })
  })
  await page.goto('/#session=selection')
  await page.locator('.diff-line').first().waitFor({ state: 'attached' })
})

async function lineBox(page: import('@playwright/test').Page, line: number) {
  const box = await page
    .locator(`[data-line-new-num="${line}"]`)
    .first()
    .boundingBox()
  if (!box) throw new Error(`line ${line} is not visible`)
  return box
}

test('a single-line comment previews the 16 lines GitLab will show', async ({
  page,
}) => {
  const gutterLine = page.locator('[data-line-new-num="30"]').first()
  await gutterLine.scrollIntoViewIfNeeded()
  await gutterLine.hover()
  await page.getByRole('button', { name: 'Comment on new line 30' }).click()

  await expect(
    page.locator('.diff-line-widget .comment-composer'),
  ).toBeVisible()

  const previewed = page.locator('.diff-line.delta-context-preview')
  await expect(previewed).toHaveCount(16)

  const numbers = await previewed
    .locator('[data-line-new-num]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-line-new-num')),
    )
  expect(numbers[0]).toBe('15')
  expect(numbers[numbers.length - 1]).toBe('30')
})

test('the preview stops at the first line near the top of a file', async ({
  page,
}) => {
  const gutterLine = page.locator('[data-line-new-num="4"]').first()
  await gutterLine.hover()
  await page.getByRole('button', { name: 'Comment on new line 4' }).click()

  await expect(page.locator('.diff-line.delta-context-preview')).toHaveCount(4)
})

test('dragging across code selects a comment range', async ({ page }) => {
  const start = await lineBox(page, 12)
  const end = await lineBox(page, 15)
  const code = await page
    .locator('[data-line-new-num="12"]')
    .first()
    .evaluate((node) => {
      const content = node
        .closest('.diff-line')
        ?.querySelector('.diff-line-content')
      const rect = content?.getBoundingClientRect()
      return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null
    })
  if (!code) throw new Error('code cell is missing')

  await page.mouse.move(code.x, code.y)
  await page.mouse.down()
  await page.mouse.move(code.x, end.y + end.height / 2, { steps: 8 })
  await page.mouse.up()

  const composer = page.locator('.diff-line-widget .comment-composer')
  await expect(composer).toBeVisible()
  await expect(composer.getByText(/lines 12–15/)).toBeVisible()
  expect(start.y).toBeLessThan(end.y)
})

test('a short drag inside one code line still selects text', async ({
  page,
}) => {
  const anchor = page.locator('[data-line-new-num="20"]').first()
  await anchor.scrollIntoViewIfNeeded()
  const code = await anchor
    .evaluate((node) => {
      const content = node
        .closest('.diff-line')
        ?.querySelector('.diff-line-content')
      // Start past the "+" operator glyph so the drag lands on code text.
      const text = content?.querySelector('span:not([class*="operator"])')
      const rect = (text ?? content)?.getBoundingClientRect()
      return rect
        ? { x: rect.x + 4, y: rect.y + rect.height / 2, width: rect.width }
        : null
    })
  if (!code) throw new Error('code cell is missing')

  await page.mouse.move(code.x, code.y)
  await page.mouse.down()
  await page.mouse.move(code.x + Math.min(160, code.width - 12), code.y, {
    steps: 6,
  })
  await page.mouse.up()

  await expect(
    page.locator('.diff-line-widget .comment-composer'),
  ).toHaveCount(0)
  const selected = await page.evaluate(
    () => document.getSelection()?.toString() ?? '',
  )
  expect(selected.length).toBeGreaterThan(0)
})
