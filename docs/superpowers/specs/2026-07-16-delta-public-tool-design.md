# Delta Public Tool Design

**Status:** Approved for planning  
**Date:** 2026-07-16

## Purpose

Delta will be a public, local-first GitLab merge-request review tool for GitLab.com and self-hosted GitLab users. It will preserve the familiar GitLab review model while making diff navigation and inline discussion work substantially more responsive.

The first release targets developers who already use `glab` and `uv`. GitLab remains the source of truth, and Delta runs only on the developer's machine.

## Product Scope

### First public release

Users can:

- launch Delta with `uvx --from delta-review delta`;
- open a merge request from its URL or from the current Git repository;
- browse a virtualized file tree;
- view unified and split diffs;
- see existing inline discussions;
- reply to discussions;
- resolve and unresolve discussions;
- select a line or line range and submit an immediate inline comment; and
- see whether GitLab anchored a comment inline or Delta had to post a general fallback discussion.

### Explicit exclusions

The first release does not include:

- batched or draft reviews;
- approvals or change requests;
- merge-request authoring;
- pipeline or issue management;
- hosted accounts, shared servers, or telemetry;
- mobile support; or
- a requirement for Node.js or npm on an end user's machine.

## Architecture

Delta is a Python package containing a FastAPI backend and a prebuilt React frontend.

```text
Browser
  │ same-origin HTTP
  ▼
Delta on 127.0.0.1
  ├─ FastAPI routes
  ├─ GitLab API client
  ├─ verified discussion service
  └─ prebuilt React assets
       │
       ├─ invokes glab for host and token resolution
       └─ calls GitLab.com or self-hosted GitLab over HTTPS
```

The CLI starts an available loopback port, serves the application, and opens the browser. The server binds only to `127.0.0.1`. It obtains authentication through `glab`, injects the token into server-side GitLab requests, and never returns or logs the token.

Maintainers and CI use Node.js to build the React application. The resulting static bundle ships inside the Python package, so `uvx` users do not need Node.js or npm.

## Components

### CLI and configuration

The CLI accepts an MR URL and supports explicit `--host`, `--project`, and `--mr` values. When values are omitted, it inspects the current repository's Git remote and asks `glab` for the authenticated host. Explicit arguments take precedence over detected values.

Configuration supports GitLab.com and arbitrary self-hosted hosts without organization-specific defaults.

### GitLab API client

The asynchronous `httpx` client:

- constructs API URLs for the selected host;
- injects authentication server-side;
- sets bounded connection and response timeouts;
- normalizes GitLab error responses for the UI; and
- feature-detects paginated diffs and other version-dependent APIs.

The client prefers the paginated merge-request diffs endpoint when available and falls back to the broadly supported changes endpoint.

### Review services

Focused services handle:

- merge-request metadata and diff retrieval;
- discussion retrieval, replies, and resolution state;
- conversion between rendered diff lines and GitLab position payloads; and
- verified inline-comment creation.

Before creating each new inline comment, Delta fetches the current diff version SHAs. It sends a JSON position payload with the correct old/new line fields, verifies that the returned note has a non-null position, and returns the placement result to the UI.

If GitLab rejects a valid inline position before creating a discussion, Delta may post a general discussion containing a visible file-and-line marker. If GitLab accepts the request but silently drops the position, Delta returns that already-created general discussion instead of posting a duplicate. The UI must identify either outcome as general placement; it must not present the comment as inline.

### React application

The frontend contains:

- an MR shell for title and navigation;
- a virtualized file tree;
- a lazy or virtualized unified/split diff viewer;
- inline discussion widgets;
- a line and line-range selection model; and
- an immediate comment composer.

Server state uses TanStack Query for caching, background refresh, and prefetching. Draft composer text and view preferences remain local UI state.

`@git-diff-view/react` is the selected diff library after comparing its current package and documentation with `react-diff-view`. It provides unified/split rendering, widgets, extend data, syntax highlighting, and a Web Worker path. The first frontend task must verify line-range selection and discussion-widget placement against a synthesized GitLab diff before the full viewer is built.

## Data Flow

### Opening a merge request

1. The CLI resolves the host, project, and MR.
2. The browser requests configuration from the loopback server.
3. The frontend fetches MR metadata, diffs, and discussions through same-origin routes.
4. TanStack Query caches responses and prefetches adjacent files.
5. The diff viewer renders only visible or nearby content.

### Posting an inline comment

1. The user selects one line or a contiguous line range.
2. The frontend sends paths, old/new line coordinates, side information, and body text to Delta.
3. The backend fetches fresh diff-version SHAs.
4. The position service validates and builds the GitLab JSON payload.
5. The backend posts the discussion and verifies its returned position.
6. The UI inserts the confirmed discussion and labels any general fallback accurately.

### Replying and resolving

Replies and resolve/unresolve actions use the relevant GitLab discussion endpoints. The UI may update optimistically but must reconcile with the authoritative response and restore prior state if the request fails.

## Error Handling

Delta presents actionable messages for:

- missing `glab`;
- no authenticated host or expired credentials;
- a remote that cannot be mapped to GitLab;
- inaccessible projects or MRs;
- unsupported or older GitLab APIs;
- truncated diffs;
- stale diff positions after a new push;
- rate limiting and network timeouts; and
- comments that cannot be anchored inline.

The backend emits structured error codes and safe messages. Logs may include host, project, endpoint, status, and request timing, but never tokens, authorization headers, or comment bodies by default.

## Performance Requirements

Responsiveness is a product requirement rather than later optimization:

- diff syntax highlighting must not block scrolling;
- large file lists and diffs must use lazy or virtualized rendering;
- cached files should reopen without a blocking request;
- adjacent files should be prefetched;
- discussion actions should provide immediate feedback; and
- a repeatable large public MR will serve as the baseline benchmark.

The local Python proxy is expected to add negligible latency compared with GitLab network requests and browser diff rendering. Benchmarking will measure end-to-end interactions rather than proxy throughput in isolation.

## Verification Strategy

Backend unit tests cover:

- Git remote, host, project, and MR resolution;
- GitLab URL construction;
- added, removed, context, and line-range position payloads;
- fresh SHA retrieval;
- inline-position verification;
- general fallback behavior; and
- secret redaction.

Backend integration tests use mocked GitLab responses for metadata, diffs, discussions, replies, resolution changes, feature detection, and failures.

Frontend tests cover:

- file selection;
- unified/split mode;
- existing discussion rendering;
- line and range selection;
- comment submission;
- reply and resolution interactions; and
- visible fallback and error states.

An opt-in smoke test runs against a real test project without storing credentials in the repository. Performance checks use a documented large public MR and record initial open, file switch, and scroll responsiveness.

## README and Asset Update

The repository README will describe Delta honestly as a design-stage project. It will include:

- `delta-assets/banner.svg` at the top;
- the value proposition and status;
- the intended v1 review workflow;
- `delta-assets/how_works.png`;
- `delta-assets/private.png`;
- privacy and security guarantees;
- the public architecture direction;
- links to `design-doc.md` and `delta-assets/how-delta-works.pptx`; and
- no runnable installation command until the package exists.

The banner's lower pill will align with the tagline:

- pill: `x="66"`, `width="337"`;
- status dot: `cx="88"`; and
- pill text: `x="104"`.

The vertical positions, colors, wording, animations, and the rest of the banner remain unchanged. Both `delta-assets/build_banner.js` and generated `delta-assets/banner.svg` receive the same coordinates so regeneration is deterministic.

## Distribution

The initial supported command is `uvx --from delta-review delta`. The distribution name is `delta-review` because the `delta` name is already occupied on PyPI; the installed console command remains `delta`. The Python package includes the prebuilt frontend and declares its backend dependencies.

Standalone executables may be added after the review flow and package layout stabilize. Native packaging is not required for the first public release and must not reshape the architecture prematurely.

## Success Criteria

The public MVP succeeds when a GitLab.com or self-hosted GitLab user with `glab` and `uv` can:

1. launch Delta with `uvx --from delta-review delta` and without Node.js;
2. open an MR and navigate a large diff responsively;
3. read existing inline discussions;
4. reply and resolve or unresolve discussions;
5. select a line or range and post a verified comment; and
6. understand clearly when GitLab could not anchor that comment inline.
