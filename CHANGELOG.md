# vite-plugin-justif

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
