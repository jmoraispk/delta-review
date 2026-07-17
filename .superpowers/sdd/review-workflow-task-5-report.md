# Task 5: Start Drag Selection from the Comment Button

## RED

Added `dragStartFromElement` coverage for a new-line comment button and retained
rejection coverage for links, inputs, textareas, and selects.

```powershell
npm test --prefix web -- --run src/review/dragSelection.test.ts
```

Result before implementation: failed as expected with
`TypeError: dragStartFromElement is not a function`.

Added integration coverage for an unresolved comment-button pointer gesture:
the compatibility `mousedown` is cancelled, no widget opens before release,
and the widget opens after `pointerup`.

```powershell
npm test --prefix web -- --run src/test/DiffViewer.integration.test.tsx
```

Result before implementation: failed as expected because the compatibility
`mousedown` was not cancelled.

## GREEN

Implemented `dragStartFromElement`, classifying valid gutter starts and comment
button starts. `ActiveDrag` now records `openOnRelease`; comment-button
compatibility mouse events are prevented and stopped until the pointer gesture
resolves. A no-movement comment-button gesture dispatches the renderer-owned
`mousedown` on release, while gutter no-movement behavior remains a no-op.

Focused verification:

```powershell
npm test --prefix web -- --run src/review/dragSelection.test.ts
```

Result: 4 tests passed.

```powershell
npm test --prefix web -- --run src/test/DiffViewer.integration.test.tsx
```

Result: 3 tests passed.

## Browser coverage

Updated `web/e2e/diff-performance.spec.ts` to cover:

- Unified new-side `+` press-drag from line 1 to line 3, asserting `lines 1–3`.
- Unified new-side `+` press-release on line 1, asserting `line 1`.
- Split old-side `+` drag from line 3 to line 1, asserting `lines 1–3`.

```powershell
npm run benchmark:browser --prefix web
```

Result: 1 Playwright test passed. Reported metrics included 26.2 ms cached
switch time, 0 long tasks above 100 ms, and a 1533 px review scroll position.

## Integration and full suite

```powershell
npm test --prefix web -- --run src/review/dragSelection.test.ts src/test/DiffViewer.integration.test.tsx
```

Result: 2 test files and 7 tests passed.

```powershell
npm test --prefix web
```

Result: 11 test files and 56 tests passed.

## Self-review

`git diff --check` completed without whitespace errors. The implementation keeps
normal `mousedown` targets routed through `rememberModifier`; only an active,
unresolved comment-button gesture prevents and stops compatibility mouse input.
