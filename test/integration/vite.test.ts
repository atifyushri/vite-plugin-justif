/**
 * End-to-end integration: the plugin against a real Vite build and dev server.
 *
 * The fixture is materialized in a temp directory whose `node_modules`
 * symlinks both `justif` (the published peer, installed in this package) and
 * `vite-plugin-justif` (this package, so `virtual:justif/auto`'s import of
 * `vite-plugin-justif/runtime/auto` resolves through the real `exports` map)
 * — the same resolution a consumer's app performs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mkdtemp,
  rm,
  mkdir,
  symlink,
  writeFile,
  readdir,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { vitePluginJustif } from "../../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "../..");

let fixture: string;
let outDirRoot: string;

const fixtureHtml = `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8" />
    <title>justif fixture</title>
  </head>
  <body>
    <p>Hello, world. This is fixture prose that should justify beautifully.</p>
  </body>
  <script type="module" src="/main.js"></script>
</html>`;

const mainJs = `import { justify, hyphenators } from "virtual:justif";
export { justify, hyphenators };
`;

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vite-plugin-justif-"));
  await writeFile(join(fixture, "index.html"), fixtureHtml);
  await writeFile(join(fixture, "main.js"), mainJs);
  const nm = join(fixture, "node_modules");
  await mkdir(nm, { recursive: true });
  await symlink(join(packageRoot, "node_modules", "justif"), join(nm, "justif"), "dir");
  await symlink(packageRoot, join(nm, "vite-plugin-justif"), "dir");
  outDirRoot = join(fixture, "dist");
});

afterAll(async () => {
  await rm(fixture, { recursive: true, force: true });
});

describe("vite build", () => {
  it("bundles both virtual modules and injects the auto entry", async () => {
    await build({
      configFile: false,
      logLevel: "silent",
      root: fixture,
      plugins: [vitePluginJustif()],
      build: {
        outDir: outDirRoot,
        emptyOutDir: true,
        manifest: true,
        // Keep identifiers so assertions can look at the emitted code.
        minify: false,
      },
    });

    const jsFiles = (await readdir(join(outDirRoot, "assets"))).filter((f) =>
      f.endsWith(".js"),
    );
    expect(jsFiles.length).toBeGreaterThan(0);

    // The injected auto script must be bundled into a real asset, and the
    // inline `virtual:` import must not survive into the emitted HTML.
    const html = await readFile(join(outDirRoot, "index.html"), "utf8");
    expect(html).toMatch(/<script type="module"[^>]*\/assets\/[^"]+\.js/);
    expect(html).not.toContain("virtual:justif");

    // No unresolved `virtual:` imports may remain in the output, and the
    // runtime boot must be bundled. Languages must be code-split: with the
    // default language set the entry chunk cannot contain every pattern.
    let bundledAuto = false;
    let sawEnUs = false;
    let sawDe = false;
    for (const f of jsFiles) {
      const code = await readFile(join(outDirRoot, "assets", f), "utf8");
      expect(code).not.toMatch(/from\s*["']virtual:justif/);
      expect(code).not.toMatch(/import\(\s*["']virtual:justif/);
      expect(code).not.toContain("+ id +");
      if (code.includes("bootAuto")) bundledAuto = true;
      if (code.includes("hyphenateEnUS")) sawEnUs = true;
      if (code.includes("hyphenateDe")) sawDe = true;
    }
    expect(bundledAuto).toBe(true);
    expect(sawEnUs).toBe(true);
    expect(sawDe).toBe(true);

    // The manifest maps hash-less entry names to their hashed files. It does
    // not list virtual module ids (they compile into the entry chunks above),
    // so treat its presence and file integrity as the smoke check.
    const manifest = JSON.parse(
      await readFile(join(outDirRoot, ".vite", "manifest.json"), "utf8"),
    ) as Record<string, { file: string }>;
    expect(Object.keys(manifest).length).toBeGreaterThan(0);
    for (const { file } of Object.values(manifest)) {
      if (file.endsWith(".js")) {
        await expect(readFile(join(outDirRoot, file), "utf8")).resolves.toBeTruthy();
      }
    }
  });

  it("limits the languages to the configured subset", async () => {
    const root = join(fixture, "subset");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "index.html"), fixtureHtml);
    await writeFile(join(root, "main.js"), mainJs);
    await symlink(join(fixture, "node_modules"), join(root, "node_modules"), "dir");

    await build({
      configFile: false,
      logLevel: "silent",
      root,
      plugins: [vitePluginJustif({ languages: ["en-us", "de"] })],
      build: { outDir: join(root, "dist"), emptyOutDir: true, minify: false },
    });

    // Entry names are hashed/merged in Vite 8; assert over all JS output.
    let code = "";
    for (const f of (await readdir(join(root, "dist", "assets"))).filter((f) =>
      f.endsWith(".js"),
    )) {
      code += await readFile(join(root, "dist", "assets", f), "utf8");
    }
    expect(code).toContain("hyphenateEnUS");
    expect(code).toContain("hyphenateDe");
    expect(code).not.toContain("hyphenateCa");
  });
});

describe("vite dev server", () => {
  it(
    "resolves and transforms both virtual modules",
    async () => {
      const { createServer } = await import("vite");
      const server = await createServer({
        configFile: false,
        logLevel: "silent",
        root: fixture,
        plugins: [vitePluginJustif({ languages: ["en-us", "de"] })],
        server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true },
      });
      try {
        const core = await server.transformRequest("virtual:justif");
        expect(core?.code).toContain("hyphenators");
        expect(core?.code).toContain("hyphenateEnUS");
        expect(core?.code).toContain("hyphenateDe");
        expect(core?.code).not.toContain("hyphenateCa");

        const auto = await server.transformRequest("virtual:justif/auto");
        expect(auto?.code).toContain("bootAuto");
        expect(auto?.code).toContain('languageIds: ["en-us","de"]');
        expect(auto?.code).toContain("loadHyphenator: (id) => loaders[id]?.()");
        // Dev rewrites bare specifiers to /@fs/... paths; assert the parts.
        expect(auto?.code).toContain("m.hyphenateEnUS");
        expect(auto?.code).toContain("hyphenate/en-us.js");
        expect(auto?.code).toContain("hyphenate/de.js");
        expect(auto?.code).not.toContain("hyphenateCa");
      } finally {
        await server.close();
      }
    },
    30_000,
  );
});