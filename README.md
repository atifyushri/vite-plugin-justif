# vite-plugin-justif

[justif](https://github.com/lyallcooper/justif) for Vite, without the CDN script.

`justif` ships its auto-enhancement as a `<script type="module">` from a CDN,
and the CDN build loads non-English hyphenation with dynamically built
`./hyphenate/<id>.js` specifiers — which no bundler can follow. This plugin
solves both problems:

- `virtual:justif` — the core API (`justify`, `unjustify`) plus a `hyphenators`
  map, with every selected language imported **statically**.
- `virtual:justif/auto` — the drop-in auto-enhancement, bundled. Languages are
  **code-split**: each language ships as its own chunk, loaded only when that
  language actually appears in the page.
- HTML injection — a module script importing `virtual:justif/auto` is added to
  every `index.html` entry, so enabling the plugin is the whole setup.

Requires Vite `^6.3.0 || ^7.0.0 || ^8.0.0` and `justif` `^0.9.0` as peer
dependencies.

**[Live demo](https://atifyushri.github.io/vite-plugin-justif/)** — justified,
hyphenated prose in three languages, each shipping as its own lazy chunk, with
a toggle to compare against native browser justification. Source in
[`example/`](example/README.md).

## Install

```sh
npm install justif vite-plugin-justif
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginJustif } from "vite-plugin-justif";

export default defineConfig({
    plugins: [vitePluginJustif()],
});
```

That's it. Every paragraph matching justif's stock candidate selector
(`p, li, dd, blockquote, figcaption`) with `text-align: justify` is enhanced:
lazy hyphenation in the paragraph's language, spacing fallback for languages
without a pattern, `data-justif` markers, and a `window.justif` escape hatch.

### Options

```ts
vitePluginJustif({
    /** Languages to bundle. Also controls bundle size.
     *  Defaults to all 23 bundled languages. */
    languages: ["en-us", "de", "fr"],
    /** Candidate selector for the auto-enhancement
     *  (default: "p, li, dd, blockquote, figcaption"). */
    selector: "article p",
    /** Log a reason for every paragraph kept on native layout,
     *  and any unrecognized --justif-* property. */
    debug: true,
    /** Wait for scripts that rewrite text on DOMContentLoaded
     *  (default: false). See "Playing Nicely With Other Scripts". */
    defer: true,
    /** Inject the auto entry into every HTML file (default: true). */
    inject: false,
    /** Hide candidates until typeset — no flash of native justification
     *  (default: false). Reveals after 1.5s even if enhancement stalls. */
    cloak: true,
});
```

Set `inject: false` when a strict Content-Security-Policy blocks inline
scripts — then import `virtual:justif/auto` from your own entry. `selector`,
`debug`, and `defer` are baked into the generated module, so they apply either
way.

```ts
import "virtual:justif/auto";
```

### Playing Nicely With Other Scripts

justif reads each paragraph once and then owns its DOM, so scripts that
rewrite text — math rendering, syntax highlighting, translation — must run
first. The injected auto entry is appended to `<head>`, so it runs before any
module entry that comes later in the document. Two fixes, in order of
preference:

- `inject: false`, then load `virtual:justif/auto` from your entry once the
  transform has run. Use a dynamic `import()`: a static `import` is hoisted
  and would run before the transform.

    ```ts
    renderMathInElement(document.body);
    await import("virtual:justif/auto");
    ```

- `defer: true` — justif's `data-justif-defer`: the page is read one task
  after `DOMContentLoaded`, after every module script and every
  `DOMContentLoaded` listener. The trade-off is that native justification may
  paint first and reflow; `cloak` hides that.

### Avoiding the Enhancement Flash

First paint happens before module scripts run, so without help the browser
shows native justification for an instant before justif retypesets. `cloak:
true` fixes this: candidates are hidden by a pre-paint style plus a
`data-justif-cloak` attribute on `<html>`, and the runtime removes the
attribute once layout settles (or after 1.5s, whichever comes first, so
content is never trapped). Both knobs take an object form:

```ts
cloak: {
    /** Fallback reveal in ms (default: 1500); false = reveal on booted only. */
    timeout: 4000,
    /** Skip the default visibility rule and bring your own cloak CSS. */
    style: false,
}
```

Your CSS can key transitions off the attribute for a fade-in:

```css
article p {
    transition: opacity 0.25s ease;
}
html[data-justif-cloak] article p {
    opacity: 0;
}
```

Under a strict CSP (`inject: false`), write the attribute yourself —
`<html data-justif-cloak>` — and the runtime still reveals; no inline script
is involved.

### Runtime API

`bootAuto` is exported as `vite-plugin-justif/runtime/auto`. It returns a
`JustifAutoHandle` — the same object it exposes on `window.justif`:

```ts
import type { Hyphenator, JustifAutoHandle } from "vite-plugin-justif/runtime/auto";
```

- `justify` / `unjustify` — the core API.
- `controllers` — the active [JustifyController][]s, rebuilt in place across
  `reconfigure()` so held references stay live.
- `booted` — resolves once layout has converged for every group.
- `reconfigure()` — re-reads `--justif-*` configuration and rebuilds
  controllers. (There is no style watcher; call it when config changes.) A
  no-op until the boot has run.

[JustifyController]: https://github.com/lyallcooper/justif

## Configuration

justif's declarative `--justif-*` layout options are fully supported: set
them on any element and they apply per group, e.g.

```css
:root {
    --justif-hanging-punctuation: all-line-edges;
    --justif-expansion: 4%;
    --justif-last-line-min-width: none;
}
```

The full surface: `--justif-hanging-punctuation`,
`--justif-hanging-characters-start`, `--justif-hanging-characters-end`,
`--justif-protrusion`, `--justif-expansion`, `--justif-tracking`,
`--justif-last-line-min-width`, `--justif-last-line-fit`,
`--justif-space-stretch`, `--justif-space-shrink`. The character sets are
quoted strings that replace the built-in set for that edge (`none` hangs
nothing there):

```css
article {
    --justif-hanging-characters-start: "‘’“”([{";
}
```

Invalid values fall back to the default with one console warning per
property and value. Unlike the CDN script, the plugin does not register the
properties with `@property`, so values are read as written: use plain numbers,
percentages, and lowercase keywords — `calc()` and exponent notation (`1e-2`)
read as invalid. (There is no live style watcher — call
`window.justif.reconfigure()` after changing them at runtime.)

See the [justif README](https://github.com/lyallcooper/justif) for the available
properties, keywords, and measurement semantics.

## How It Works

`resolveId`/`load` hook filters answer for `virtual:justif` and
`virtual:justif/auto` only, so the plugin never intercepts other modules.
`virtual:justif/auto` is a generated module that imports the runtime bootstrap
statically, then declares one static-string `import()` per language:

```js
import { bootAuto } from "vite-plugin-justif/runtime/auto";

bootAuto({
    selector: "p, li, dd, blockquote, figcaption",
    debug: false,
    defer: false,
    cloakTimeout: 1500,
    loaders: {
        "en-us": () => import("justif/hyphenate/en-us").then((m) => m.hyphenateEnUS),
        de: () => import("justif/hyphenate/de").then((m) => m.hyphenateDe),
    },
});
```

Vite treats every specifier as a static import it can code-split, so the
initial bundle stays small and each language loads on demand — concurrently
per language group. The resolved hyphenator (or `undefined`, for languages
without a pattern) gives that group the same hyphenation justif's own auto
loader would have built at runtime.

## Supported Languages

`ca, da, de, el, en-gb, en-us, es, fi, fr, hr, hu, it, nb, nl, nn, pl, pt,
ru, sk, sl, sv, tr, uk` (`en` resolves to `en-us`, `no` to `nb`).

## License

MIT
