import browser from 'webextension-polyfill'

/**
 * Reloads an unpacked extension from its own UI, so a rebuild does not require
 * a trip to chrome://extensions. Absent from release builds: __DELTA_DEV__ is
 * defined false there, so this compiles to `if (false)` and drops out.
 *
 * Reloading tears down every page the extension owns, including the one this
 * button lives on. Measured in Chrome 149: the hub tab is *closed outright* —
 * its page target disappears, so there is nothing left to refresh. The button
 * says so rather than leaving the disappearance unexplained.
 *
 * The click deliberately does nothing but reload. Three recovery sequences
 * were tried against a real Chrome and all failed, so none of them is here:
 *
 * - `tabs.reload()` before `runtime.reload()` — tab still closed.
 * - `runtime.reload()` before `tabs.reload()` — tab still closed; the second
 *   call does not survive long enough to run.
 * - `tabs.create()` before `runtime.reload()` — leaves a hollow tab that looks
 *   like the hub but has no `chrome` global and an unmounted React root, which
 *   is worse than no tab at all.
 *
 * See check 23 in docs/extension-smoke.md.
 */
export function DevReload() {
  if (!__DELTA_DEV__) return null

  return (
    <button
      className="dev-reload"
      title="Reload the unpacked extension from disk. This tab does not survive it — open the hub again afterwards."
      type="button"
      onClick={() => browser.runtime.reload()}
    >
      Reload extension
    </button>
  )
}
