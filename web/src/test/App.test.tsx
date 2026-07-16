import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'

import App from '../App'
import { TestProviders } from './fixtures'

beforeEach(() => {
  window.location.hash = '#session=test-session'
})

test('renders merge request identity and files', async () => {
  render(<App />, { wrapper: TestProviders })

  expect(await screen.findByText('Improve parser errors')).toBeVisible()
  expect(screen.getAllByText('src/parser.py')[0]).toBeVisible()
  expect(screen.getByText('gitlab.example.com')).toBeVisible()
})
