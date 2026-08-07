import type { DiffTheme } from './diffWorkerClient'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

export function preferredTheme(): DiffTheme {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia(LIGHT_QUERY).matches
    ? 'light'
    : 'dark'
}

/** Follows the system theme. Returns an unsubscribe function. */
export function watchTheme(onChange: (theme: DiffTheme) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const media = window.matchMedia(LIGHT_QUERY)
  const update = () => onChange(media.matches ? 'light' : 'dark')
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}
