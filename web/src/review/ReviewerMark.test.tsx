import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { ReviewerMark, reviewerKind } from './ReviewerMark'

test('identifies CodeRabbit from its display name', () => {
  expect(
    reviewerKind({
      name: 'CodeRabbit',
      username: 'service_account_group_7407_cfbe022a7cd5bf75168b2e70f1942b82',
    }),
  ).toBe('coderabbit')
})

test('identifies Greptile from its display name', () => {
  expect(
    reviewerKind({
      name: 'Greptile',
      username: 'service_account_group_7407_c52410dfdb7b9ece68d605d180dd8d6a',
    }),
  ).toBe('greptile')
})

test('normalizes reviewer display names', () => {
  expect(reviewerKind({ name: '  cOdErAbBiT  ', username: 'opaque' })).toBe(
    'coderabbit',
  )
})

test('falls back to a human reviewer', () => {
  expect(reviewerKind({ name: 'Ada Lovelace', username: 'ada' })).toBe('human')
})

test('renders local marks for automated reviewers', () => {
  render(
    <>
      <ReviewerMark author={{ name: 'CodeRabbit', username: 'opaque' }} />
      <ReviewerMark author={{ name: 'Greptile', username: 'opaque' }} />
    </>,
  )

  expect(screen.getByAltText('CodeRabbit')).toHaveAttribute(
    'src',
    expect.stringContaining('data:image/svg+xml'),
  )
  expect(screen.getByAltText('Greptile')).toHaveAttribute(
    'src',
    expect.stringContaining('data:image/svg+xml'),
  )
})

test('renders an initial for human reviewers', () => {
  render(<ReviewerMark author={{ name: 'Ada Lovelace', username: 'ada' }} />)

  expect(screen.getByText('A')).toHaveAttribute('aria-hidden', 'true')
})
