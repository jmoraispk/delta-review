/**
 * Defined by web/scripts/build-extension.mjs. False in every release build, so
 * development-only branches compile away instead of shipping unreachable.
 */
declare const __DELTA_DEV__: boolean
