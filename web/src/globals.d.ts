/**
 * A compile-time flag, never a real global. `web/scripts/build-extension.mjs`
 * defines it `true` for a `--dev` extension build and `false` otherwise, so
 * development-only branches compile away instead of shipping unreachable.
 *
 * Keep every reference hub-only — `web/src/hub-main.tsx` and the modules below
 * it. The SPA that the Python CLI serves is a separate entry point
 * (`web/src/main.tsx`) and has no use for the flag; a reference reaching it
 * would type-check against this declaration, lint clean and pass tests
 * (`web/src/test/setup.ts` stubs the flag false for every vitest file), then
 * throw a `ReferenceError` in the shipped product. `web/vite.config.ts` defines
 * it `false` for `vite build` as a backstop against exactly that, which makes
 * such a reference dead code rather than a crash — harmless, not correct.
 *
 * That backstop is deliberately scoped to `build`. Vitest loads the same config
 * with command `serve`, where the identifier stays undefined so
 * `vi.stubGlobal('__DELTA_DEV__', …)` still decides what a test sees.
 */
declare const __DELTA_DEV__: boolean
