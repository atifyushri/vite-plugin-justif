# vite-plugin-justif — Agent Notes

Vite plugin bundling [justif](https://github.com/Lyall/justif)'s auto-enhancement
without its CDN script. Unpublished; breaking changes are currently fine.

## Commands

- `npm run typecheck` — `tsc --noEmit` (strict, `noUncheckedIndexedAccess`)
- `npm run lint` — oxlint (`.oxlintrc.json`; correctness=error, suspicious=warn)
- `npm run format` / `npm run format:check` — oxfmt (stock config)
- `npm test` — builds with tsup, then runs all vitest suites (unit + integration)
- `npx vitest run test/unit` — fast unit-only loop, no build needed

## Architecture

- `src/index.ts` — plugin factory. Flat options `{ languages, selector, debug,
inject }`; both virtual modules are always registered (unimported virtual
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
- `src/runtime/auto.ts` — browser bootstrap (`bootAuto`), published as
  `vite-plugin-justif/runtime/auto` and deliberately NOT re-exported from the
  main entry (keeps justif's browser engine out of `vite.config.ts` in Node).

## Invariants

- `test/unit/parity.test.ts` pins the mirrors to the installed justif dist.
  When bumping the `justif` dependency, run the tests; on parity failure,
  update `src/languages.ts` to match upstream. `resolveJustifLanguage` and the
  config parser cannot be auto-checked — re-diff them against justif's
  `src/auto.ts` / auto-options source on every justif bump.
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
