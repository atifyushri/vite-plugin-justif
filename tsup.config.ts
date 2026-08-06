import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  // Declarations come from `tsc -p tsconfig.build.json` (the build script):
  // tsup's dts bundling needs the TypeScript JS API, which the Go-native
  // typescript@7 no longer ships.
  dts: false,
  target: "es2020" as const,
  sourcemap: true,
  treeshake: true,
  // justif and vite are peer dependencies: the consumer's Vite resolves them.
  // `justif` is also a devDependency (for typecheck/tests), so it must be
  // forced external or tsup would bundle the published package.
  external: ["vite", "justif", /^justif\//],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts" },
  },
  {
    ...shared,
    entry: { "runtime/auto": "src/runtime/auto.ts" },
    // One entry per build block: no shared chunk, so importing
    // `vite-plugin-justif/runtime/auto` pulls only that module.
    splitting: false,
  },
]);
