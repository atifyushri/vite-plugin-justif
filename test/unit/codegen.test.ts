import { describe, it, expect } from "vitest";
import {
    generateCoreModule,
    generateAutoModule,
    RESOLVED_AUTO_MODULE_ID,
    RESOLVED_CORE_MODULE_ID,
} from "../../src/virtual.js";
import {
    BUNDLED_LANGUAGE_IDS,
    hyphenatorExportName,
    resolveJustifLanguage,
} from "../../src/languages.js";
import { vitePluginJustif } from "../../src/index.js";

/** Invoke the plugin's `load` hook the way Vite would for a resolved id. */
function loadVirtual(plugin: ReturnType<typeof vitePluginJustif>, id: string): string | null {
    const hook = plugin.load;
    if (hook === undefined || typeof hook === "function") {
        throw new Error("expected an object load hook");
    }
    return (hook.handler as (id: string) => string | null)(id);
}

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
        expect(code).toContain(`import { hyphenateEnUS } from "justif/hyphenate/en-us";`);
        expect(code).toContain(`import { hyphenateDe } from "justif/hyphenate/de";`);
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
    it("ships every selected language as a static-string lazy loader", () => {
        const code = generateAutoModule({
            languages: ["en-us", "ca"],
            selector: "article p",
            debug: true,
            cloakTimeout: 1500,
        });
        expect(code).toContain("cloakTimeout: 1500");
        expect(code).toContain(`import { bootAuto } from "vite-plugin-justif/runtime/auto";`);
        expect(code).toContain("loaders: {");
        expect(code).toContain(
            `"en-us": () => import("justif/hyphenate/en-us").then((m) => m.hyphenateEnUS)`,
        );
        expect(code).toContain(
            `"ca": () => import("justif/hyphenate/ca").then((m) => m.hyphenateCa)`,
        );
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
            cloakTimeout: false,
        });
        expect(code).toContain('selector: "p[data-x=\\"y\\"]"');
        expect(code).toContain("debug: false");
        expect(code).toContain("cloakTimeout: false");
    });
});

describe("vitePluginJustif options", () => {
    it("defaults to all languages, stock selector, injection on", () => {
        const plugin = vitePluginJustif();
        const auto = loadVirtual(plugin, RESOLVED_AUTO_MODULE_ID)!;
        for (const id of BUNDLED_LANGUAGE_IDS) {
            expect(auto).toContain(`"${id}": () => import(`);
        }
        expect(auto).toContain(`selector: "p, li, dd, blockquote, figcaption"`);
        expect(auto).toContain("debug: false");
        expect(plugin.transformIndexHtml).toBeDefined();
    });

    it("dedupes languages and limits the generated modules to them", () => {
        const plugin = vitePluginJustif({ languages: ["de", "de", "en-us"] });
        const core = loadVirtual(plugin, RESOLVED_CORE_MODULE_ID)!;
        expect(core.match(/hyphenateDe\b/g)).not.toBeNull();
        expect(core).not.toContain("hyphenateCa");
        const auto = loadVirtual(plugin, RESOLVED_AUTO_MODULE_ID)!;
        expect(auto.match(/justif\/hyphenate\/de/g)).toHaveLength(1);
        expect(auto).not.toContain("hyphenateCa");
    });

    it("bakes selector and debug into the auto module even without injection", () => {
        const plugin = vitePluginJustif({
            selector: ".prose p",
            debug: true,
            inject: false,
        });
        const auto = loadVirtual(plugin, RESOLVED_AUTO_MODULE_ID)!;
        expect(auto).toContain(`selector: ".prose p"`);
        expect(auto).toContain("debug: true");
        expect(plugin.transformIndexHtml).toBeUndefined();
    });

    it("rejects unknown languages", () => {
        expect(() =>
            // @ts-expect-error invalid language for the test
            vitePluginJustif({ languages: ["zz"] }),
        ).toThrow(/unknown hyphenation language "zz"/);
    });
});

/** Invoke the plugin's `transformIndexHtml` hook the way Vite would. */
function injectedTags(plugin: ReturnType<typeof vitePluginJustif>) {
    const hook = plugin.transformIndexHtml;
    if (hook === undefined || typeof hook === "function" || !("handler" in hook)) {
        throw new Error("expected an object transformIndexHtml hook");
    }
    return (hook.handler as () => Array<{ tag: string; children?: string }>)();
}

describe("vitePluginJustif cloak injection", () => {
    it("injects only the entry script by default", () => {
        const tags = injectedTags(vitePluginJustif());
        expect(tags).toHaveLength(1);
        expect(tags[0]!.children).toContain("virtual:justif/auto");
    });

    it("cloak adds a pre-paint hiding style and attribute setter", () => {
        const tags = injectedTags(vitePluginJustif({ cloak: true, selector: "article p" }));
        expect(tags).toHaveLength(3);
        const [style, setter, entry] = tags;
        expect(style!.tag).toBe("style");
        expect(style!.children).toBe(
            `html[data-justif-cloak] :is(article p) { visibility: hidden; }`,
        );
        expect(setter!.tag).toBe("script");
        expect(setter!.children).toContain(`setAttribute("data-justif-cloak", "")`);
        expect(entry!.children).toContain("virtual:justif/auto");
    });

    it("cloak style: false keeps the attribute mechanics, skips the rule", () => {
        const tags = injectedTags(vitePluginJustif({ cloak: { style: false } }));
        expect(tags).toHaveLength(2);
        expect(tags[0]!.tag).toBe("script");
        expect(tags[0]!.children).toContain("data-justif-cloak");
        expect(tags[1]!.children).toContain("virtual:justif/auto");
    });

    it("cloak timeout flows into the generated auto module", () => {
        const plugin = vitePluginJustif({ cloak: { timeout: 4000 } });
        expect(loadVirtual(plugin, RESOLVED_AUTO_MODULE_ID)).toContain("cloakTimeout: 4000");
        const noFallback = vitePluginJustif({ cloak: { timeout: false } });
        expect(loadVirtual(noFallback, RESOLVED_AUTO_MODULE_ID)).toContain("cloakTimeout: false");
    });
});
