---
"vite-plugin-justif": minor
---

Add a `cloak` option that eliminates the flash of natively-justified text
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
