# vite-plugin-justif

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
