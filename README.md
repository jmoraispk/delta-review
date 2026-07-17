<p align="center">
  <img src="./assets/banner.svg" alt="Delta — GitLab MR reviews, minus the wait." width="1280">
</p>

# DeltaReview

DeltaReview is a fast, local-first interface for reviewing GitLab merge
requests. It reuses your existing `glab` authentication and keeps GitLab as
the source of truth.

> **Status:** Alpha.

## How it works

![Browser SPA to local proxy to GitLab API architecture](./assets/how_works.png)

## Private by design

![Delta privacy model](./assets/private.png)

## Quick start

Requires [uv](https://docs.astral.sh/uv/) and an authenticated
[glab](https://gitlab.com/gitlab-org/cli) installation.

<details>
<summary>Install and authenticate glab on Windows</summary>

```powershell
winget install GLab.GLab
glab auth login --hostname gitlab.example.com
glab auth status --hostname gitlab.example.com
```

Restart PowerShell after installing `glab`.

</details>

```console
uvx delta-review https://gitlab.com/group/project/-/merge_requests/42
```

## Troubleshooting

- Authentication errors: run `glab auth status` for the target hostname.
- `403` or `404`: verify project/MR access with the same `glab` account.
- `429`: wait briefly, then use **Retry**.
- `5xx`: GitLab rejected an upstream API request. Check the MR metadata,
  diffs, and discussions endpoints with `glab api` to identify which failed.
- Collapsed or oversized files: open that file in GitLab for the full diff.

## Current scope

DeltaReview reads text diffs and lets you create, reply to, resolve, and
unresolve GitLab discussions. If GitLab rejects a multiline position,
DeltaReview tries the last selected line and then posts a clearly labeled
general discussion. It does not submit approvals, batch reviews, or render
oversized/binary files.

## Development

```console
uv sync
npm ci --prefix web
uv run pytest
npm test --prefix web -- --run
npm run build --prefix web
```

## Architecture

- [Architecture slides](./assets/how-delta-works.pptx)

Contributions are welcome through
[issues](https://github.com/jmoraispk/delta-review/issues) and pull requests.
DeltaReview is released under the [MIT License](./LICENSE).
