# vite-plugin-justif

[justif](https://github.com/Lyall/justif) for Vite, without the CDN script.

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

Requires Vite `^6.3.0 || ^7.0.0 || ^8.0.0` and `justif` as a peer dependency.

A runnable demo lives in [`example/`](example/README.md) — justified,
hyphenated prose in three languages, each shipping as its own lazy chunk.

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
    /** Log a reason for every paragraph kept on native layout. */
    debug: true,
    /** Inject the auto entry into every HTML file (default: true). */
    inject: false,
});
```

Set `inject: false` when a strict Content-Security-Policy blocks inline
scripts — then import `virtual:justif/auto` from your own entry. `selector`
and `debug` are baked into the generated module, so they apply either way.

```ts
import "virtual:justif/auto";
```

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
  controllers. (There is no style watcher; call it when config changes.)

[JustifyController]: https://github.com/Lyall/justif

## Configuration

justif's CSS configuration is fully supported: set the `layout-options` on any
element and they apply per group, e.g.

```css
:root {
    --justif-paragraph-layout: 50.5;
    --justif-inline-alignment: center;
}
```

See the [justif README](https://github.com/Lyall/justif) for the available
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
