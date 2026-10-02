# vite-plugin-justif — Agent Notes

Vite plugin bundling [justif](https://github.com/lyallcooper/justif)'s auto-enhancement
without its CDN script. Unpublished; breaking changes are currently fine.

## Commands

bun is the package manager (`bun.lock`); scripts call binaries directly, so
any runner works. Development needs Node >= 22.14 (`findPackageJSON` in the
parity tests); consumers need only `engines` (Node >= 20.19, or Bun/Deno).

- `bun run check` — the full gate: typecheck, lint, format check, build, tests
- `bun run typecheck` — `tsc --noEmit` (TS 7 Go-native; strict,
  `noUncheckedIndexedAccess`)
- `bun run lint` — oxlint (`.oxlintrc.json`; correctness=error, suspicious=warn)
- `bun run format` / `format:check` — oxfmt (4-space indent; oxfmt owns it)
- `bun run build` — tsup emits JS; `tsc -p tsconfig.build.json` emits d.ts
  (tsup's dts bundling needs the TypeScript JS API, which TS 7 removed)
- `bun test` is NOT the test runner — use `bun run test` (vitest)
- `bunx vitest run test/unit` — fast unit-only loop, no build needed
- `bunx changeset` — record a release note; CI's release workflow versions
  and publishes via the changesets action (npm trusted publishing / OIDC —
  no token secret; configured on npmjs.com for release.yml)

## Architecture

- `src/index.ts` — plugin factory. Flat options `{ languages, selector, debug,
defer, inject, cloak }`; both virtual modules are always registered (unimported virtual
  modules cost nothing), only HTML injection is conditional.
- `src/virtual.ts` — virtual module ids and codegen. `virtual:justif` uses
  static imports; `virtual:justif/auto` uses static-STRING dynamic imports so
  Vite code-splits one chunk per language. Never build specifiers by
  concatenation — that is exactly the upstream defect this plugin exists to fix.
- `src/languages.ts` — **upstream mirror #1**: bundled language ids, module
  naming, BCP 47 resolution, stock selector, all hand-ported from justif's
  drop-in (which does not export them).
- `src/runtime/config.ts` — **upstream mirror #2**: the `--justif-*` CSS
  configuration parser, including the serialized grouping key.
- `src/runtime/auto.ts` — browser bootstrap (`bootAuto`), including the
  drop-in's boot timing (`defer` = `data-justif-defer`), published as
  `vite-plugin-justif/runtime/auto` and deliberately NOT re-exported from the
  main entry (keeps justif's browser engine out of `vite.config.ts` in Node).
- `example/` — standalone demo app; imports the plugin from `../dist` (build
  the root first) with a `runtime/auto` alias in its vite config. Do NOT link
  it to the root via bun `file:`/`link:`/workspace protocols — bun resolves
  those against the global link registry or recurses into the repo's own
  `example/`, creating an infinitely nested `node_modules`.

## Invariants

- `test/unit/parity.test.ts` pins the mirrors to the installed justif dist.
  When bumping the `justif` dependency, run the tests; on parity failure,
  update `src/languages.ts` to match upstream. The parity test also pins the
  `--justif-*` property list and its key order. `resolveJustifLanguage` and
  the parser's value grammar cannot be auto-checked — re-diff them against
  justif's `src/auto-languages.ts` (`moduleFor`), `src/auto-options.ts`, and
  `src/auto.ts` (boot timing, grouping) on every justif bump.
- The grouping key in `runtime/auto.ts` and the key serialization in
  `runtime/config.ts` must stay byte-compatible with justif's drop-in so
  paragraphs group into controllers identically.
- `justif` is ESM-only with no `./package.json` export: resolve it in Node via
  `module.findPackageJSON`, not `require.resolve`.
- tsup builds two isolated entries (`index`, `runtime/auto`) with no shared
  chunk; keep it that way so `runtime/auto` imports stay self-contained.

## Conventions

- oxfmt owns formatting; run `npm run format` after edits.
- Markdown headings use Title Case.
- Comments explain constraints and upstream provenance, not what the next
  line does; match the existing density.
