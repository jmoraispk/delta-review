import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { createFakeBrowser } from '../test/fakeBrowser'

const reload = vi.fn()
const fake = createFakeBrowser() as ReturnType<typeof createFakeBrowser> & {
  runtime: { reload: () => void }
}
fake.runtime = { reload }

vi.mock('webextension-polyfill', () => ({ default: fake }))

beforeEach(() => {
  reload.mockClear()
  vi.stubGlobal('__DELTA_DEV__', true)
})

test('reloads the extension when clicked', async () => {
  const { DevReload } = await import('./devReload')
  render(<DevReload />)

  await userEvent.click(screen.getByRole('button', { name: /reload extension/i }))

  expect(reload).toHaveBeenCalledOnce()
})

// Chrome closes the hub tab outright when the extension reloads (measured in
// Chrome 149; see check 23 in docs/extension-smoke.md). The title used to
// promise a refresh, which is not a thing you can do to a tab that is gone.
test('warns that the tab does not survive, and says what to do instead', async () => {
  const { DevReload } = await import('./devReload')
  render(<DevReload />)

  const title =
    screen.getByRole('button', { name: /reload extension/i }).getAttribute('title') ?? ''

  expect(title).toMatch(/does not survive/i)
  expect(title).toMatch(/open the hub again/i)
  expect(title).not.toMatch(/refresh/i)
})

test('renders nothing in a release build', async () => {
  vi.stubGlobal('__DELTA_DEV__', false)
  const { DevReload } = await import('./devReload')
  const { container } = render(<DevReload />)

  expect(container).toBeEmptyDOMElement()
  expect(
    screen.queryByRole('button', { name: /reload extension/i }),
  ).toBeNull()
})
