---
"vite-plugin-justif": minor
---

Restructure the plugin surface (breaking, pre-1.0):

- Options flatten to `{ languages, selector, debug, inject }`; `selector` and
  `debug` now apply with `inject: false` too, and the `coreModule`/`autoModule`
  toggles are removed (both virtual modules are always registered).
- `bootAuto` moves solely to `vite-plugin-justif/runtime/auto`, takes a single
  `loaders` map, loads language groups concurrently with per-group failure
  containment, and returns the `JustifAutoHandle` it exposes on `window.justif`.
- Main entry exports only the plugin factory, option/language types, and the
  virtual module id constants.
