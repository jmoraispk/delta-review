# Delta — a local-first, snappier GitLab MR review UI

**Status:** Draft for build. Working codename "Delta" (rename freely).
**Audience:** The coding agent that will implement this, plus any human reviewer.
**How to read this:** This is a *design proposal*, not a spec handed down from on high. The reasoning behind each choice is written out so you can challenge it. If you see a better path — different libraries, different architecture, a simpler MVP — say so and adjust. The section "Where to push back" at the end lists the load-bearing assumptions most worth questioning.

> **Direction update (2026-07-16):** This document preserves the original
> self-hosted concept. The approved
> [public-tool design](./docs/superpowers/specs/2026-07-16-delta-public-tool-design.md)
> supersedes it for audience, v1 scope, package naming, and implementation
> decisions.

---

## 1. Problem & context

Reviewing merge requests in GitLab's web UI is slow. On large MRs the Changes tab is sluggish to load and to scroll, navigating between files is heavy, and the whole app-shell round-trip adds latency to every action. For a team that reviews a lot of code, this friction is a real tax on throughput and on reviewer patience.

We want a **polished interface that closely emulates GitLab's review experience but is noticeably snappier**. Not a reinvention of code review — the same mental model (file tree, diffs, inline comment threads, resolve, approve) — just fast.

**Environment specifics that shape everything:**

- The target GitLab is **self-hosted / enterprise** (e.g. an internal `gitlab.<org>` instance), not gitlab.com. Reachable over the corporate network; the API base is `https://$GITLAB_HOST/api/v4`.
- Users already have the **`glab` CLI** installed and authenticated (`glab auth login`). Their token lives at `~/.config/glab-cli/config.yml`, keyed by host.
- We do **not** control the GitLab instance and can't assume we can register an OAuth application (that needs instance-admin cooperation).

**Prior art we're building on:** a small Python tool, `mrreview.py`, already solves the genuinely hard part of GitLab review automation — posting **verified inline comments**. It resolves the glab token, fetches the MR's diff-version SHAs, builds the `position` payload, posts to the Discussions API, and *checks that the comment actually landed inline* rather than silently degrading to a general note. Its `GL` client, token resolution, versions/changes fetch, and position/line-type logic are directly reusable as the backend core. (See §6 for why this logic is non-trivial.)

---

## 2. Goals / non-goals

**Goals**

- Emulate GitLab's MR review UI closely enough that reviewers don't have to relearn anything: file tree, unified + split diff, syntax highlighting, inline comment threads, resolve/unresolve, approve.
- Be *snappier* than the GitLab web UI on the operations reviewers do most: opening an MR, switching files, scrolling a large diff, posting a comment.
- Zero-login for the common case: if you've run `glab auth login`, it just works.
- Work against self-hosted GitLab out of the box (`GITLAB_HOST`).
- Distribute as a single local command a developer can run in seconds.

**Non-goals (for now)**

- Multi-user hosted deployment, SSO, or a shared server. This is a per-developer local tool.
- Authoring MRs, CI management, issue tracking, or anything outside the review loop.
- Mobile. Desktop browser only.
- Replacing GitLab as the source of truth. Everything we write goes back to GitLab via its API; GitLab remains authoritative.

---

## 3. Constraints & environment

- **CORS + token security force a local proxy.** A browser SPA cannot call the self-hosted GitLab API directly: it's cross-origin, and putting a `PRIVATE-TOKEN` into frontend JavaScript is both blocked and a security smell. So a small local server must sit between the SPA and GitLab regardless of the auth model. This constraint is the origin of the whole architecture — see §4.
- **No OAuth app.** Since we likely can't register one on the instance, token-based auth (reusing glab's) is the pragmatic path.
- **Single user, localhost.** The server binds to `127.0.0.1`, serves one developer, reads one token. No secret storage, no session system.
- **Self-hosted API quirks.** Enterprise GitLab may run an older version than gitlab.com. Prefer widely-supported endpoints; verify version-gated features (see §6, `/changes` vs `/diffs`, draft notes).

---

## 4. Architecture — the key insight

Because a local proxy is forced by CORS anyway (§3), we get auth for free: **have the proxy read the token from glab's config**. That single decision eliminates login entirely. Anyone who has run `glab auth login` runs Delta and it works — no per-person token UI, no OAuth, no secret storage.

```
Browser SPA (localhost)  ──same-origin──▶  Local proxy  ──server-side──▶  GitLab /api/v4
     React, no token                    reads glab token,                 self-hosted
                                        injects PRIVATE-TOKEN
                                              ▲
                                     ~/.config/glab-cli/config.yml
                                        (token already on disk)
```

Request flow:
1. SPA calls `GET /api/...` on its own origin (`localhost:PORT`).
2. Proxy attaches `PRIVATE-TOKEN` and forwards to `https://$GITLAB_HOST/api/v4/...`.
3. Response streams back to the SPA, cached client-side.

The token never enters the browser. The proxy also serves the built SPA as static files, so it's a single process and a single origin — no CORS config needed at all.

---

## 5. Recommended tech stack (with rationale)

### Backend / proxy — reuse the Python engine

**FastAPI + httpx + uvicorn**, wrapping the existing `mrreview.py` logic.

Rationale: the hard parts already exist in Python (token resolution, the `GL` client, versions/changes fetch, position/line-type logic with fallback detection). Wrapping that in FastAPI means adding a catch-all `/api/{path}` proxy route and static-file serving — roughly 40 lines on top of code we already trust. Reimplementing the position logic in another language just to change runtimes would be pure risk for no gain.

The proxy is deliberately thin: it forwards to GitLab and adds the token. The one place it's *not* a dumb pass-through is comment posting, where it reuses the verified-inline logic (§6) so the frontend can rely on "did this land inline?" being answered correctly.

**Alternative:** an all-TypeScript stack (Hono or Fastify proxy on Bun/Node) collapses everything to one toolchain. Legitimate, but only worth it if you value a single language more than reusing working code. Given the engine exists in Python, the default is Python. *(Push back here if you disagree — see §11.)*

### Frontend — React + TypeScript + Vite

Three libraries carry the experience:

- **Diff rendering: `react-diff-view`.** The proven choice for GitHub/GitLab-style review UIs — Mozilla's addons-code-manager uses it for exactly this (inline review messages anchored to diff lines). It parses unified diffs, tokenizes syntax highlighting in a **web worker** so the UI never blocks, supports **lazy hunk rendering** for large diffs, and has a `Decoration`/widget system for injecting comment threads at specific lines. One integration note: it expects git-header diff format (`diff --git a/… b/…`), while GitLab's `/changes` returns bare per-file hunks — so synthesize the header (a few lines; well documented).
  - **Alternative worth evaluating:** `@git-diff-view/react` — newer, framework-agnostic, nicer widget API, file-tree built in, actively maintained. If its widget ergonomics save meaningful time, prefer it. Decide early; don't build against both.
- **Data layer: TanStack Query.** Not optional if "snappier" is the goal. It caches every API response, refetches in the background, and enables prefetch-on-hover. This is where most of the perceived speed comes from (§7).
- **Syntax highlighting: refractor** (Prism-based, pairs natively with react-diff-view's tokenizer), or **shiki** for VS Code-grade grammars if the extra fidelity/weight is worth it.

**Chrome:** Tailwind for styling, plus **Radix** or **shadcn/ui** for dialogs, dropdowns, resizable panes, and keyboard-friendly primitives — polish without hand-rolling accessibility.

**Local UI state** (draft comments not yet submitted, selected file, view mode): a small store like **Zustand**. Server state stays in TanStack Query; don't duplicate it into a store.

### Distribution

Bundle the built frontend into the Python package and ship as a one-command launcher: `uvx --from delta-review delta` (or a `pipx`/console-script install). The distribution uses `delta-review` because `delta` is already occupied on PyPI, while the installed command remains `delta`. It starts uvicorn on `127.0.0.1`, opens the browser, and reads `GITLAB_HOST` (default derived from the git remote of the CWD, or an explicit flag/env). One command, no build step for the user.

---

## 6. GitLab API specifics that matter (read before implementing comments)

This is the hard-won context. The naive version of comment posting is subtly broken; here's why.

- **Inline comments are not `glab mr note`.** That command only creates *general* MR comments. Line-anchored comments require the Discussions API: `POST /projects/:id/merge_requests/:iid/discussions` with a `position` object.
- **The position payload needs three SHAs** from the MR's current version: `GET /projects/:id/merge_requests/:iid/versions` → element `[0]` gives `base_commit_sha`, `start_commit_sha`, `head_commit_sha`. **Fetch these fresh every time; never cache them** — they change when the MR is updated, and stale SHAs cause rejects.
- **The silent-fallback trap.** If you post position data via form-encoded fields (as `glab api --field position[...]` does), GitLab will **silently drop the position and create a general comment** when it dislikes the anchor — no error. You only find out by inspecting the returned note's `position` field. So: post a **JSON body**, and **verify** `response.notes[0].position` is non-null. `mrreview.py` already does exactly this.
- **Line-type rules for the position:**
  - Added line → set `new_line` only (leave `old_line` null), plus `new_path`/`old_path`.
  - Removed line → set `old_line` only.
  - Context/unchanged line → set **both** `old_line` and `new_line`.
- **Graceful fallback (3-tier), from `mrreview.py`:** Tier 1 = exact inline; if GitLab rejects the anchor (line "not visible": diff truncation, whitespace-only hunks, collapsed context), Tier 3 = post a general thread with a `📍 file:line` marker so the comment isn't lost. (Tier 2, caller-provided nearest-hunk anchoring, is optional.) Surface the tier to the UI so the reviewer knows what happened.
- **Diff source: `/changes` vs `/diffs`.** `/merge_requests/:iid/changes` returns `changes[]` with `old_path`, `new_path`, `diff` (unified hunks), and flags (`new_file`, `deleted_file`, `renamed_file`). It's widely supported but **may truncate very large diffs** — which then makes some lines un-anchorable (more Tier-3 fallbacks). The newer `/diffs` endpoint is paginated and avoids truncation but is version-gated. **Verify which the target instance supports and prefer `/diffs` if available.**
- **Batched review = Draft Notes API.** GitLab's "Start a review" (comments staged unpublished, then submitted together) maps to `POST /merge_requests/:iid/draft_notes` + a bulk publish call — *not* the Discussions endpoint. Same `position` payload. This is the right primitive for a real review flow; confirm availability on the instance.
- **Other lifecycle endpoints** (for §8 v2): approve `POST .../approve`; resolve a thread `PUT .../discussions/:discussion_id?resolved=true`; reply to a discussion `POST .../discussions/:discussion_id/notes`.

---

## 7. Where "snappier" actually comes from

Design for these deliberately — they *are* the value proposition, not incidental optimizations:

1. **Direct REST, no page render.** Hitting `/api/v4` skips GitLab's server-side HTML rendering and heavy app shell.
2. **Client-side cache + prefetch (TanStack Query).** Prefetch an MR's diff and discussions when the user hovers it in the list; switching files/MRs becomes instant after first load.
3. **Virtualized / lazy diff rendering.** GitLab's biggest slowness is building thousands of DOM rows for a large diff. Render only what's near the viewport (react-diff-view's lazy hunk rendering + a virtualizer for the file list).
4. **Optimistic UI.** A posted comment, a resolved thread, an approval appears immediately and reconciles on the API response.
5. **Web-worker tokenization.** Syntax highlighting off the main thread so scrolling never janks.

If it isn't clearly faster than GitLab on a 50-file MR, it has failed its one job. Treat a large real MR as the benchmark from day one.

---

## 8. Scope & phasing

**v1 — the fast read-diff-and-comment loop (the core bet):**
- List my MRs (assigned + authored); open one.
- File tree + diff view (unified and split), syntax highlighting, expand/collapse context.
- Post an inline comment (verified, with fallback) and see existing discussion threads inline.
- The whole thing demonstrably snappier than the web UI.

**v2 — full review lifecycle:**
- Reply to existing threads; resolve/unresolve.
- Approve / request changes.
- **Batched draft review** (draft notes → bulk publish) — the "Start a review" workflow.
- Keyboard navigation (next/prev file, next/prev comment, `c` to comment) — a big snappiness win for power users.
- MR metadata sidebar (description, pipeline status, reviewers).

**Later / maybe:**
- Multi-repo / global MR list across projects.
- Suggestions (single/multi-line code suggestions via the suggestion syntax).
- Side-by-side "start a review" vs immediate-comment toggle.

The v1/v2 line is a genuine decision, not a formality — see §11.

---

## 9. Proxy API surface (starting point)

Keep the proxy mostly a transparent pass-through so the frontend can use GitLab's REST shapes directly:

- `GET  /api/*` → forward to `$GITLAB_HOST/api/v4/*` with the token attached (covers MR list, changes, versions, discussions read, etc.).
- `POST /api/mrs/:iid/inline-comment` → **not** a pass-through; uses the verified-inline logic (fetch fresh SHAs, build position by line-type, post JSON, verify, fall back). Returns `{ tier, discussion }` so the UI can show inline vs general.
- `POST /api/*`, `PUT /api/*` → forward (for replies, resolve, approve, draft notes) — but consider routing draft-note/position writes through the same verified helper.
- `GET  /config` → returns `{ host, project, user }` resolved server-side so the SPA can render context without guessing.

Decide whether *all* position-bearing writes (draft notes included) go through the verified helper, or only immediate comments. Recommendation: all of them, for consistency.

---

## 10. UX notes

Emulate GitLab closely so there's nothing to relearn: file tree on the left, diff in the center, comment threads inline in the diff (not a separate panel), a header with MR title/status/approve, and a discussion/overview view. Support both unified and split diff and remember the choice. Show comment tier honestly (inline vs "posted as general thread because the line wasn't anchorable"). Prioritize keyboard navigation early — it's disproportionately responsible for the "this feels fast" impression.

Two companion assets accompany this doc: a single **"How it works" slide** (architecture flow + value props) and an animated **README banner**. The banner is intentionally a starting point — richer interactivity (hover/JS) doesn't run in GitHub's `<img>`-embedded SVG, so the animated version is CSS/SMIL only; a fully interactive version belongs on a GitHub Pages page and can be deferred.

---

## 11. Where to push back (assumptions worth challenging)

These are the choices most likely to be wrong. Challenge them explicitly before building:

1. **Local-first per-user vs a shared deployment.** The whole design assumes single-user localhost. If the team actually wants a shared hosted instance, almost everything changes (auth, secrets, multi-tenancy). Confirm this is really a personal tool.
2. **Python backend vs all-TypeScript.** Recommended Python to reuse `mrreview.py`. If you'd rather have one toolchain and think the ~40-line proxy + port of the position logic is cheap, all-TS is defensible. Decide before writing code.
3. **`react-diff-view` vs `@git-diff-view/react`.** Both viable; the second is newer with nicer widget ergonomics. Pick one after a spike; don't hedge.
4. **v1 scope.** Is "read + inline comment" enough to be useful, or is the tool dead-on-arrival without resolve/approve/batched-review? If reviewers can't *complete* a review in it, they'll bounce back to GitLab and never return. This is the single most important scoping call.
5. **`/changes` vs `/diffs` and truncation.** If the target instance truncates large diffs on `/changes`, the anchorability of comments on big MRs degrades. Verify early against a real large MR; it may force `/diffs` (and its pagination) into v1.
6. **Draft notes availability.** Batched review depends on the Draft Notes API existing on the instance's GitLab version. If it's absent, "Start a review" must be faked client-side (stage locally, post on submit) — a meaningfully different implementation.
7. **The snappiness claim itself.** If, after virtualization + caching, it isn't clearly faster than the web UI on a large MR, reconsider the premise before polishing features.

---

## 12. Risks & mitigations

- **Un-anchorable comments on truncated diffs** → verified-post + Tier-3 fallback (never lose a comment); prefer `/diffs`; show tier in UI.
- **glab config format/location varies** → resolve token via `glab config get token --host $HOST`, fall back to `GITLAB_TOKEN` env; fail with a clear message pointing to `glab auth login`.
- **Self-hosted version drift** → feature-detect (draft notes, `/diffs`) and degrade gracefully.
- **Large-MR performance regressions** → benchmark a 50-file MR continuously; virtualization is a v1 requirement, not a v2 nicety.
- **Token exposure** → token stays server-side; bind to `127.0.0.1` only; never log it; never send it to the client (not even in `/config`).

---

## 13. References

- Discussions API: `POST /projects/:id/merge_requests/:iid/discussions` (with `position`).
- Versions (for SHAs): `GET /projects/:id/merge_requests/:iid/versions`.
- Changes / diffs: `GET .../changes`, `GET .../diffs`.
- Draft notes: `POST .../draft_notes` + bulk publish.
- Lifecycle: `POST .../approve`, `PUT .../discussions/:id?resolved=true`, `POST .../discussions/:id/notes`.
- Libraries: `react-diff-view`, `@git-diff-view/react`, `@tanstack/react-query`, `refractor`/`shiki`, Vite, FastAPI + httpx.
- Existing engine: `mrreview.py` (token resolution, `GL` client, verified inline posting, 3-tier fallback).
