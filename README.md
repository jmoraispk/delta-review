<p align="center">
  <img src="./assets/banner.svg" alt="Delta — GitLab MR reviews, minus the wait." width="1280">
</p>

# delta-review

Delta is a fast, local-first interface for reviewing GitLab merge requests.
It reuses your existing `glab` authentication and keeps GitLab as the source
of truth.

> **Status:** Alpha. PyPI publishing is not available yet.

## Quick start

Prerequisites: [uv](https://docs.astral.sh/uv/) and an authenticated
[glab](https://gitlab.com/gitlab-org/cli) installation.
After the first PyPI release, launch with:

```console
glab auth login
uvx --from delta-review delta https://gitlab.com/group/project/-/merge_requests/42
```

For self-managed GitLab, authenticate and use the full MR URL:

```console
glab auth login --hostname gitlab.example.com
uvx --from delta-review delta https://gitlab.example.com/group/project/-/merge_requests/42
```

Until PyPI publishing starts, run from a clone:

```console
uv sync
uv run delta https://gitlab.com/group/project/-/merge_requests/42
```

You can also identify an MR without a URL:

```console
uv run delta --host gitlab.example.com --project group/project --mr 42
```

Delta starts a loopback-only server, opens your browser, and uses GitLab as
the source of truth for comments and resolution state.

## How it works

![Browser SPA to local proxy to GitLab API architecture](./assets/how_works.png)

## Private by design

![Delta privacy model](./assets/private.png)

Delta has no hosted backend or telemetry. The local process holds your GitLab
token in memory and sends merge request data and review actions to the GitLab
instance you selected. Content is also handled by your browser and installed
dependencies; use the same endpoint and workstation security you would use
for `glab`.

## Troubleshooting

- Authentication errors: run `glab auth status` for the target hostname.
- `403` or `404`: verify project/MR access with the same `glab` account.
- `429` or `5xx`: wait for GitLab to recover, then use **Retry**.
- Collapsed or oversized files: open that file in GitLab for the full diff.

## Current scope

Delta reads text diffs and lets you create, reply to, resolve, and unresolve
GitLab discussions. If GitLab rejects a multiline position, Delta tries the
last selected line and then posts a clearly labeled general discussion. It
does not submit approvals, batch reviews, or render oversized/binary files.

## Development

```console
uv sync
npm ci --prefix web
uv run pytest
npm test --prefix web -- --run
npm run build --prefix web
uv run delta https://gitlab.com/group/project/-/merge_requests/42
```

## Design notes

- [Product design](./design-doc.md)
- [Architecture slides](./assets/how-delta-works.pptx)

Contributions are welcome through
[issues](https://github.com/jmoraispk/delta-review/issues) and pull requests.
Delta is released under the [MIT License](./LICENSE).
