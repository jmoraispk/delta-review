# Extension smoke test

Run in Chrome, Edge, and Firefox before tagging a release.

1. Load the unpacked build (`web/dist-extension/<browser>`).
2. Click the Delta toolbar icon → the hub opens on the setup card.
3. Settings → add your GitLab host and an `api`-scoped token → the browser
   prompts for permission for that host only → the host appears with your
   username.
4. Return to the lists → "Awaiting your review" and "Yours" populate.
5. Open a merge request from a list → the diff renders.
6. Select a single line → post a comment → it appears inline.
7. Drag-select several lines → post a comment → it appears with the full range.
8. Reply to a discussion → the reply appears.
9. Resolve, then unresolve it → the state sticks after a reload.
10. Navigate to a GitLab merge request page in another tab, click the Delta
    icon → the hub jumps straight to that merge request, in the same tab as
    before rather than a new one.
11. Paste a merge request URL into "Open by URL" → it opens.
12. Paste a URL for an unconfigured host → it offers to add the host.
13. Revoke the host permission in the browser's extension settings, reload the
    hub → the list offers "Grant access" rather than an opaque error. Click it,
    accept, and the lists reload.
14. Open devtools on the hub page and confirm no token string appears in any
    message payload logged to the console. (`chrome.storage.local` is reachable
    from an extension page by design; what matters is that no response from the
    service worker carries the token.)
15. Remove the host in settings → the lists return to the setup card.

## Assumptions this build could not settle

Each item below is a decision the implementation made that only a real browser
can confirm. Every one records what to do if it fails, so record the outcome
rather than just passing or failing it.

16. **`activeTab` populates `tab.url`.** Click the Delta icon while the active
    tab is on a GitLab merge request page. Expected: the hub opens on that
    merge request's review view (this is step 10, checked here for its cause).
    If it opens the lists instead, `tab.url` arrived empty, because `activeTab`
    did not expose it. The remedy is adding `"tabs"` to `permissions` in
    `web/src/extension/manifest.base.json`, at the cost of a "read your
    browsing history" warning on every install.
17. **The permission prompt fires from the settings form.** In Settings, add a
    host. Expected: the browser shows its permission prompt for that host.
    `browser.permissions.request` requires a user gesture, and it is called
    from inside a TanStack Query mutation, two microtask ticks after the click.
    If no prompt appears, the gesture was lost in those ticks and the
    `permissions.request` call must move into the click handler itself.
18. **Firefox honours `optional_host_permissions` at the declared minimum.**
    Repeat check 17 on Firefox 128 specifically. The manifest sets
    `strict_min_version: 128.0` because MDN records Firefox 128 as the first
    release supporting that key, and Firefox silently drops manifest keys it
    does not recognise rather than refusing to install. Confirm on 128 that
    adding a host really does prompt and really does grant. If it does not,
    raise `strict_min_version` to the first release where it does.
19. **The hub is legible.** Load the hub with the OS in light mode, then again
    in dark mode. Check merge request titles, error messages, and the "Add
    host", "Remove" and "Grant access" buttons in both. This shipped broken
    once: `web/src/index.css` carries a legacy light-default palette alongside
    the real dark one, and the hub originally drew from the wrong set,
    rendering near-black text on a near-black background.
Checks 20–22 cannot run until the signing key exists and a release has been
published — see `docs/extension-release.md`. Until then they are *blocked*,
not failed.

20. **Chrome's `normal_installed` leaves the extension user-removable.** After
    running the policy install from `docs/install/index.html`, open
    `chrome://extensions` and confirm Delta can still be disabled and removed.
    If it cannot, the install page must say so plainly, or switch to a policy
    mode that permits removal.
21. **HKCU policy survives corporate device management.** Run the policy
    install on a managed work laptop. If device management ignores or
    overrides it, the unpacked-folder route becomes the primary instruction for
    that audience and the install page should lead with it there.
22. **Auto-update actually arrives.** Install from the install page, not from
    an unpacked folder. Then bump `version` in
    `web/src/extension/manifest.base.json`, tag, and let the release publish.
    Expected: within the browser's own update interval — or immediately, via
    "Update" on `chrome://extensions` and "Check for Updates" in Firefox's
    add-ons manager — the installed extension moves to the new version with no
    reinstall and no second visit to the install page.

    This is the one check that exercises the whole self-hosting arrangement,
    and it rests on an assumption: both update URLs point at
    `https://github.com/jmoraispk/delta-review/releases/latest/download/...`,
    which is an HTTP redirect to the current release's asset. Chrome's update
    client and Firefox's must follow that redirect. It is the standard way to
    self-host, but nothing here proves it. If the browser never updates, check
    whether it fetched `updates.xml` / `updates.json` at all; if the redirect is
    the problem, pin the update URLs to a fixed host you control instead of
    `latest/download`.
Check 23 runs only against a development build (`npm run build:extension
--prefix web -- --dev`). Release builds do not render the button at all, so on
those there is nothing to click and the check is *not applicable*, not failed.

23. **"Reload extension" closes the tab it was clicked from.** Load the
    development build and open the hub. Expected: a "Reload extension" button
    sits in the hub header, and clicking it reloads the extension from disk and
    **closes this tab outright** — it does not go blank, it disappears. Reopen
    the hub from the toolbar icon to carry on; the extension picks up whatever
    was last built.

    This was measured, not assumed: Chrome 149 via Playwright, five runs,
    headless and headed alike, closed the hub tab every time. Chrome destroys
    the page target, so nothing is left to refresh — which is why the button's
    title says to open the hub again rather than to refresh. Three recovery
    sequences were tried and all failed, so the button deliberately does nothing
    but reload: `tabs.reload()` either side of `runtime.reload()` left the tab
    closed regardless of ordering, and `tabs.create()` beforehand left a hollow
    tab that renders the hub's title with no `chrome` global and an unmounted
    React root — convincing at a glance and completely dead.

    If the tab instead survives blank, or the button is missing from a `--dev`
    build, note it: the first means Chrome's teardown changed and the title's
    wording should soften to "refresh or reopen"; the second means the
    `__DELTA_DEV__` define did not reach the bundle.

24. **The extension actually comes back, and Firefox behaves the same way.**
    Both halves of this are unverified and neither could be settled by the
    probe. Chrome, launched with `--load-extension` under automation, never
    restored the extension after `runtime.reload()` — `chrome-extension://`
    URLs returned `ERR_BLOCKED_BY_CLIENT` for thirty seconds and no service
    worker returned. That is near-certainly an artefact of command-line
    extension loading rather than real behaviour, but it means check 23
    confirms only what happens to the *tab*, never that the reload succeeded.
    So confirm by hand, in a normally loaded unpacked extension: change a
    string in the source, rebuild, click the button, reopen the hub, and check
    the new string is there. If the extension does not come back, the button is
    worse than useless and should be removed.

    **Firefox is entirely unverified.** The probe covers Chrome only. Repeat
    the whole of check 23 on Firefox: `browser.runtime.reload()` exists there,
    but whether it closes the tab, blanks it, or leaves it working is unknown.
    If Firefox misbehaves, gate the button to Chrome and say so in its title.
