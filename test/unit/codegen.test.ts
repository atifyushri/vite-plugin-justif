import { describe, it, expect } from "vitest";
import {
  generateCoreModule,
  generateAutoModule,
} from "../../src/virtual.js";
import {
  BUNDLED_LANGUAGE_IDS,
  hyphenatorExportName,
} from "../../src/constants.js";
import { resolveJustifLanguage } from "../../src/lang.js";
import {
  resolveJustifPluginOptions,
} from "../../src/index.js";

describe("hyphenatorExportName", () => {
  it("camelCases the language id to justif's export name", () => {
    expect(hyphenatorExportName("en-us")).toBe("hyphenateEnUS");
    expect(hyphenatorExportName("en-gb")).toBe("hyphenateEnGB");
    expect(hyphenatorExportName("de")).toBe("hyphenateDe");
    expect(hyphenatorExportName("nn")).toBe("hyphenateNn");
    expect(hyphenatorExportName("nb")).toBe("hyphenateNb");
    expect(hyphenatorExportName("uk")).toBe("hyphenateUk");
  });
});

describe("resolveJustifLanguage", () => {
  it("mirrors justif's drop-in language mapping", () => {
    expect(resolveJustifLanguage("")).toBe("en-us");
    expect(resolveJustifLanguage("en")).toBe("en-us");
    expect(resolveJustifLanguage("en-GB")).toBe("en-gb");
    expect(resolveJustifLanguage("en-US")).toBe("en-us");
    expect(resolveJustifLanguage("de-DE")).toBe("de");
    expect(resolveJustifLanguage("fr")).toBe("fr");
    expect(resolveJustifLanguage("no")).toBe("nb");
    expect(resolveJustifLanguage("nn")).toBe("nn");
    expect(resolveJustifLanguage("zh-CN")).toBe(null);
  });

  it("respects a subset", () => {
    const subset = new Set(["de", "en-us"]);
    expect(resolveJustifLanguage("fr", subset)).toBe(null);
    expect(resolveJustifLanguage("de", subset)).toBe("de");
    expect(resolveJustifLanguage("no", subset)).toBe(null); // nb not included
  });
});

describe("generateCoreModule", () => {
  it("re-exports justif and builds a hyphenators table", () => {
    const code = generateCoreModule(["en-us", "de"]);
    expect(code).toContain(`export * from "justif";`);
    expect(code).toContain(
      `import { hyphenateEnUS } from "justif/hyphenate/en-us";`,
    );
    expect(code).toContain(
      `import { hyphenateDe } from "justif/hyphenate/de";`,
    );
    expect(code).toContain(`"en-us": hyphenateEnUS`);
    expect(code).toContain(`"de": hyphenateDe`);
  });

  it("imports only the selected languages", () => {
    const code = generateCoreModule(["fr"]);
    expect(code).not.toContain("hyphenateDe");
    expect(code).not.toContain("hyphenateCa");
    expect(code).toContain("hyphenateFr");
  });
});

describe("generateAutoModule", () => {
  it("ships every selected language as a static-string lazy import", () => {
    const code = generateAutoModule({
      languages: ["en-us", "ca"],
      selector: "article p",
      debug: true,
    });
    expect(code).toContain(
      `import { bootAuto } from "vite-plugin-justif/runtime/auto";`,
    );
    expect(code).toContain(
      `"en-us": () => import("justif/hyphenate/en-us").then((m) => m.hyphenateEnUS)`,
    );
    expect(code).toContain(
      `"ca": () => import("justif/hyphenate/ca").then((m) => m.hyphenateCa)`,
    );
    expect(code).toContain(`languageIds: ["en-us","ca"]`);
    expect(code).toContain(`loadHyphenator: (id) => loaders[id]?.()`);
    expect(code).toContain(`selector: "article p"`);
    expect(code).toContain(`debug: true`);
    // Every specifier is a string literal a bundler can code-split; nothing
    // is built at runtime from concatenated parts.
    expect(code).not.toContain("+ id +");
  });

  it("serializes the selector defensively", () => {
    const code = generateAutoModule({
      languages: ["en-us"],
      selector: 'p[data-x="y"]',
      debug: false,
    });
    expect(code).toContain('selector: "p[data-x=\\"y\\"]"');
    expect(code).toContain("debug: false");
  });
});

describe("resolveJustifPluginOptions", () => {
  it("defaults to all languages, injection on", () => {
    const opts = resolveJustifPluginOptions();
    expect(opts.languages).toEqual(BUNDLED_LANGUAGE_IDS);
    expect(opts.inject).toEqual({
      selector: "p, li, dd, blockquote, figcaption",
      debug: false,
    });
    expect(opts.coreModule).toBe(true);
    expect(opts.autoModule).toBe(true);
  });

  it("dedupes languages and accepts a selector", () => {
    const opts = resolveJustifPluginOptions({
      languages: ["de", "de", "en-us"],
      inject: { selector: ".prose p", debug: true },
    });
    expect(opts.languages).toEqual(["de", "en-us"]);
    expect(opts.inject).toEqual({ selector: ".prose p", debug: true });
  });

  it("rejects unknown languages", () => {
    expect(() =>
      // @ts-expect-error invalid language for the test
      resolveJustifPluginOptions({ languages: ["zz"] }),
    ).toThrow(/unknown hyphenation language "zz"/);
  });

  it("rejects injection without the auto module", () => {
    expect(() =>
      resolveJustifPluginOptions({ autoModule: false }),
    ).toThrow(/requires the auto module/);
  });
});