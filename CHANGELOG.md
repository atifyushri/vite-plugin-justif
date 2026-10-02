# vite-plugin-justif

## 0.4.0

### Minor Changes

- 501f820: Upgrade to justif 0.9. The `justif` peer dependency is now `^0.9.0`.

    - The `--justif-*` configuration surface gains justif 0.8's
      `--justif-hanging-characters-start` and `--justif-hanging-characters-end`:
      quoted character sets that replace the built-in hanging set for that edge
      (`none` hangs nothing there). The grouping key matches the drop-in's, so
      paragraphs share controllers exactly as with the CDN script.
    - Invalid `--justif-*` values now log one console warning per property and
      value, and `debug` also reports unrecognized `--justif-*` properties and
      logs each controller group, as the drop-in does. The plugin does not
      register the properties with `@property`, so `calc()` and exponent notation,
      which the drop-in normalizes, read as invalid.
    - New `defer` option (and `defer` on `bootAuto`), the plugin's equivalent of
      justif 0.9.1's `data-justif-defer`: read the page one task after
      `DOMContentLoaded`, so scripts that rewrite text (math rendering, syntax
      highlighting) finish first. `bootAuto` called while the document is still
      loading now waits for `DOMContentLoaded`, and `reconfigure()` is a no-op
      until the boot has run.

### Patch Changes

- 3b634eb: Overlapping `reconfigure()` calls no longer enhance paragraphs twice. Each
  call now queues behind the previous rebuild's scan; before, two calls made
  back to back both scanned while the first was still loading hyphenation, so
  `window.justif.controllers` doubled with every overlapping pair and the
  duplicate controllers kept their observers alive.
  An earlier call's promise now resolves only once the queue behind it has
  rebuilt the page, and a controller whose teardown throws no longer makes every
  later call fail.

## 0.3.0

### Minor Changes

- fa84759: Add a `cloak` option that eliminates the flash of natively-justified text
  before enhancement: a pre-paint style and a `data-justif-cloak` attribute on
  `<html>` hide candidate paragraphs, and the runtime reveals them once layout
  has settled — or after a fallback timeout regardless, so content is never
  trapped behind a stalled chunk. `cloak: true` uses the defaults; the object
  form tunes it: `timeout` (ms, default 1500, `false` for reveal-on-booted
  only, also exposed as `cloakTimeout` on `bootAuto`) and `style: false` to
  skip the injected hiding rule and bring your own CSS. Consumer CSS can key
  transitions off the attribute; CSP setups (`inject: false`) write
  `<html data-justif-cloak>` in their HTML source and get the same reveal
  without any inline script.

## 0.2.0

### Minor Changes

- e404c66: Initial public release.

    - `virtual:justif` — justif's core API plus a `hyphenators` map, every
      selected language statically imported so builds can bundle it.
    - `virtual:justif/auto` — the drop-in auto-enhancement with per-language
      code-split chunks, loaded on demand and concurrently per language group.
    - HTML injection via `transformIndexHtml`, so enabling the plugin is the
      whole setup; `inject: false` for CSP setups keeps `selector`/`debug`
      working through a self-imported entry.
    - `bootAuto` runtime at `vite-plugin-justif/runtime/auto`, returning the
      `JustifAutoHandle` it exposes on `window.justif`.
    - Options: `{ languages, selector, debug, inject }`.
