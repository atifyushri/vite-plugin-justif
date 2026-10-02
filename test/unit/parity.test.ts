/**
 * Parity checks pinning the hand-ported upstream mirrors (src/languages.ts)
 * to the justif version actually installed. When a justif bump changes the
 * bundled language set, an export name, or the drop-in's candidate selector,
 * these fail loudly instead of letting the plugin drift.
 *
 * The remaining mirrors — `resolveJustifLanguage` and the `--justif-*`
 * parser (src/runtime/config.ts) — port unexported logic; only the parser's
 * property list is greppable (below), so their behavioral unit tests are the
 * guard, reviewed on justif bumps.
 */
import { describe, it, expect } from "vitest";
import { findPackageJSON } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    BUNDLED_LANGUAGE_IDS,
    DEFAULT_SELECTOR,
    hyphenatorExportName,
    languageModuleId,
} from "../../src/languages.js";
import { CSS_PROPERTIES } from "../../src/runtime/config.js";

// justif is ESM-only and does not export ./package.json, so neither
// require.resolve nor a bare import can reach it; findPackageJSON can.
const justifPackageJson = findPackageJSON("justif", import.meta.url)!;
const justifRoot = dirname(justifPackageJson);

describe("upstream parity with the installed justif", () => {
    it("BUNDLED_LANGUAGE_IDS matches justif's hyphenate exports", async () => {
        const pkg = JSON.parse(await readFile(justifPackageJson, "utf8")) as {
            exports: Record<string, unknown>;
        };
        const upstream = Object.keys(pkg.exports)
            .filter((key) => key.startsWith("./hyphenate/"))
            .map((key) => key.slice("./hyphenate/".length))
            // liang is the hyphenation engine, not a language.
            .filter((id) => id !== "liang")
            .toSorted();
        expect(BUNDLED_LANGUAGE_IDS.toSorted()).toEqual(upstream);
    });

    it("every language module has the export hyphenatorExportName predicts", async () => {
        for (const id of BUNDLED_LANGUAGE_IDS) {
            const module = (await import(languageModuleId(id))) as Record<string, unknown>;
            const name = hyphenatorExportName(id);
            expect(typeof module[name], `${languageModuleId(id)} → ${name}`).toBe("function");
        }
    });

    it("DEFAULT_SELECTOR appears verbatim in justif's drop-in bundle", async () => {
        const auto = await readFile(join(justifRoot, "dist", "auto.js"), "utf8");
        expect(auto).toContain(DEFAULT_SELECTOR);
    });

    it("CSS_PROPERTIES matches the drop-in's property list, in key order", async () => {
        const auto = await readFile(join(justifRoot, "dist", "auto.js"), "utf8");
        // The minified bundle keeps the list as one array literal of strings.
        const list = CSS_PROPERTIES.map((property) => JSON.stringify(property)).join(",");
        expect(auto.replace(/\s+/g, "")).toContain(`[${list}]`);
    });
});
