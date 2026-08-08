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

test('renders nothing in a release build', async () => {
  vi.stubGlobal('__DELTA_DEV__', false)
  const { DevReload } = await import('./devReload')
  const { container } = render(<DevReload />)

  expect(container).toBeEmptyDOMElement()
  expect(
    screen.queryByRole('button', { name: /reload extension/i }),
  ).toBeNull()
})
