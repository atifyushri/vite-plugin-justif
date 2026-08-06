/**
 * vite-plugin-justif — justif (publication-grade text justification) for
 * Vite, without the CDN script.
 *
 * What it adds over importing `justif` yourself:
 *
 * 1. `virtual:justif` — the core API plus a `hyphenators` map, with every
 *    selected language module imported statically so it survives the build.
 * 2. `virtual:justif/auto` — the drop-in auto-enhancement, bundled. The CDN
 *    script loads non-English hyphenation with dynamically built
 *    `./hyphenate/<id>.js` specifiers that no bundler can follow; the
 *    generated module replaces those with static imports.
 * 3. HTML injection — a module script importing `virtual:justif/auto` is
 *    added to every index.html entry via `transformIndexHtml`, so enabling
 *    the plugin is the whole setup.
 *
 * This is a Vite-only plugin: `transformIndexHtml` (and the HTML-first
 * distribution model) have no meaning under a plain Rolldown/Rollup build.
 */
import type { HtmlTagDescriptor, Plugin } from "vite";
import { BUNDLED_LANGUAGE_IDS, DEFAULT_SELECTOR, type JustifLanguage } from "./languages.js";
import {
    AUTO_MODULE_ID,
    CORE_MODULE_ID,
    RESOLVED_AUTO_MODULE_ID,
    RESOLVED_CORE_MODULE_ID,
    generateAutoModule,
    generateCoreModule,
} from "./virtual.js";

export interface JustifVitePluginOptions {
    /**
     * Bundled hyphenation languages to include. Every selected language is
     * statically imported into the generated modules, so this is also a
     * bundle-size control: `["en-us", "de", "fr"]` ships only those pattern
     * files. Defaults to all 23 bundled languages.
     */
    languages?: readonly JustifLanguage[];
    /**
     * Candidate selector baked into `virtual:justif/auto` — which elements the
     * auto-enhancement considers. Defaults to justif's stock list
     * (`p, li, dd, blockquote, figcaption`). Applies whether the module is
     * injected or imported from your own entry.
     */
    selector?: string;
    /**
     * Log a reason for every paragraph the auto-enhancement keeps on native
     * layout. Defaults to `false`.
     */
    debug?: boolean;
    /**
     * Inject a module script importing `virtual:justif/auto` into every HTML
     * entry file. Defaults to `true`. Set `false` to manage the import from
     * your own entry (useful under a strict Content-Security-Policy, where
     * inline scripts are blocked).
     */
    inject?: boolean;
}

/** `resolveId`/`load` filters: only our two virtual ids (with the null-byte
 * prefix once resolved, and optional query strings). Older bundlers that
 * ignore hook filters still hit the handlers, which null out cleanly. */
const ID_FILTER = /^virtual:justif([/?]|$)/;
const RESOLVED_ID_FILTER = /^\0virtual:justif([/?]|$)/;

export function vitePluginJustif(options: JustifVitePluginOptions = {}): Plugin {
    const languages = [...new Set(options.languages ?? BUNDLED_LANGUAGE_IDS)];
    const known = new Set<string>(BUNDLED_LANGUAGE_IDS);
    for (const id of languages) {
        if (!known.has(id)) {
            throw new Error(
                `vite-plugin-justif: unknown hyphenation language "${id}". ` +
                    `Bundled languages: ${BUNDLED_LANGUAGE_IDS.join(", ")}.`,
            );
        }
    }
    const selector = options.selector ?? DEFAULT_SELECTOR;
    const debug = options.debug ?? false;
    const inject = options.inject ?? true;

    const plugin: Plugin = {
        name: "vite-plugin-justif",
        resolveId: {
            filter: { id: ID_FILTER },
            handler(id: string) {
                if (id === CORE_MODULE_ID) return RESOLVED_CORE_MODULE_ID;
                if (id === AUTO_MODULE_ID) return RESOLVED_AUTO_MODULE_ID;
                return null;
            },
        },
        load: {
            filter: { id: RESOLVED_ID_FILTER },
            handler(id: string) {
                if (id === RESOLVED_CORE_MODULE_ID) {
                    return generateCoreModule(languages);
                }
                if (id === RESOLVED_AUTO_MODULE_ID) {
                    return generateAutoModule({ languages, selector, debug });
                }
                return null;
            },
        },
    };

    if (inject) {
        plugin.transformIndexHtml = {
            // `pre`: the injected script must go through the plugin pipeline so it
            // is treated as an entry and bundled (dev and build alike).
            order: "pre",
            handler(): HtmlTagDescriptor[] {
                return [
                    {
                        tag: "script",
                        attrs: { type: "module" },
                        children: `import ${JSON.stringify(AUTO_MODULE_ID)};`,
                        injectTo: "head",
                    },
                ];
            },
        };
    }

    return plugin;
}

export default vitePluginJustif;

export { BUNDLED_LANGUAGE_IDS } from "./languages.js";
export type { JustifLanguage } from "./languages.js";
export { CORE_MODULE_ID, AUTO_MODULE_ID } from "./virtual.js";
