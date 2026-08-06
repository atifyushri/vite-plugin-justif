# Example

A minimal Vite app showing `vite-plugin-justif` doing its job: justified,
hyphenated prose in English, German, and French, each language arriving as its
own lazy chunk.

## Run It

The example imports the plugin straight from the repository's `dist/`, so
build the plugin first:

```sh
bun install && bun run build   # repo root
cd example
bun install
bun run dev
```

`bun run build && bun run preview` inside `example/` shows the production
build — check the network tab to watch the per-language chunks load on demand.

## What to Look At

- `vite.config.ts` — the entire integration: one plugin call. (The relative
  import and the `runtime/auto` alias exist only because this example lives
  inside the plugin repo; an installed package needs neither.)
- `index.html` — no script tag for justif anywhere; the plugin injects the
  `virtual:justif/auto` entry itself. Sections carry `lang` attributes, which
  drive hyphenation-pattern choice.
- `public/style.css` — plain CSS; the only contract with the plugin is
  `text-align: justify` on candidate paragraphs.
- The browser console — `window.justif` exposes `controllers`, `booted`, and
  `reconfigure()`.
