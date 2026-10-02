---
"vite-plugin-justif": minor
---

Upgrade to justif 0.9. The `justif` peer dependency is now `^0.9.0`.

- The `--justif-*` configuration surface gains justif 0.8's
  `--justif-hanging-characters-start` and `--justif-hanging-characters-end`:
  quoted character sets that replace the built-in hanging set for that edge
  (`none` hangs nothing there). The grouping key matches the drop-in's, so
  paragraphs share controllers exactly as with the CDN script.
- Invalid `--justif-*` values now log one console warning per property and
  value, and `debug` also reports unrecognized `--justif-*` properties, as the
  drop-in does.
- New `defer` option (and `defer` on `bootAuto`), the plugin's equivalent of
  justif 0.9.1's `data-justif-defer`: read the page one task after
  `DOMContentLoaded`, so scripts that rewrite text (math rendering, syntax
  highlighting) finish first. `bootAuto` called while the document is still
  loading now waits for `DOMContentLoaded`, and `reconfigure()` is a no-op
  until a deferred boot has run.
