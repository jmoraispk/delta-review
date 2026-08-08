import browser from 'webextension-polyfill'

/**
 * Reloads an unpacked extension from its own UI, so a rebuild does not require
 * a trip to chrome://extensions. Absent from release builds: __DELTA_DEV__ is
 * defined false there, so this compiles to `if (false)` and drops out.
 *
 * Reloading invalidates every extension page, including the one this button
 * lives on, so the click is the last thing this tab does until it is
 * refreshed. The button says so rather than leaving a dead tab unexplained.
 */
export function DevReload() {
  if (!__DELTA_DEV__) return null

  return (
    <button
      className="dev-reload"
      title="Reload the unpacked extension from disk. This tab needs a refresh afterwards."
      type="button"
      onClick={() => browser.runtime.reload()}
    >
      Reload extension
    </button>
  )
}
