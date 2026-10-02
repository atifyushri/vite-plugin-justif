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
import { CLOAK_ATTRIBUTE, CLOAK_REVEAL_TIMEOUT_MS, cloakCss } from "./cloak.js";
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
     * Read the page one task after DOMContentLoaded rather than as soon as the
     * DOM is parsed — justif's `data-justif-defer`. Enable it when your own
     * scripts rewrite paragraph text (math rendering, syntax highlighting):
     * the injected auto entry sits in `<head>`, so it otherwise runs before
     * your module entries. Native justification may paint first, so it pairs
     * well with `cloak`. Defaults to `false`.
     */
    defer?: boolean;
    /**
     * Inject a module script importing `virtual:justif/auto` into every HTML
     * entry file. Defaults to `true`. Set `false` to manage the import from
     * your own entry (useful under a strict Content-Security-Policy, where
     * inline scripts are blocked).
     */
    inject?: boolean;
    /**
     * Hide candidate paragraphs until justif has typeset them, eliminating
     * the flash of natively-justified text before enhancement. Defaults to
     * `false`. Injects a pre-paint style and a `data-justif-cloak` attribute
     * on `<html>`; the runtime removes the attribute once layout has settled,
     * or after the fallback timeout regardless, so content is never trapped.
     * Pass an object to tune both. With `inject: false`, write
     * `<html data-justif-cloak>` in your HTML source instead — the runtime
     * still reveals.
     */
    cloak?: boolean | JustifCloakOptions;
}

export interface JustifCloakOptions {
    /**
     * Reveal after this many milliseconds even if enhancement has not
     * settled (a hung chunk request must never trap content). Defaults to
     * 1500. `false` disables the fallback: the page reveals only on booted.
     */
    timeout?: number | false;
    /**
     * Inject the default hiding rule (`visibility: hidden` on candidates).
     * Set `false` to own the cloak's look entirely with your own CSS keyed
     * on `html[data-justif-cloak]`; the attribute mechanics stay.
     */
    style?: boolean;
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
    const defer = options.defer ?? false;
    const inject = options.inject ?? true;
    const rawCloak = options.cloak ?? false;
    const cloak =
        rawCloak === false
            ? false
            : {
                  timeout:
                      (rawCloak === true ? undefined : rawCloak.timeout) ?? CLOAK_REVEAL_TIMEOUT_MS,
                  style: (rawCloak === true ? undefined : rawCloak.style) ?? true,
              };

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
                    return generateAutoModule({
                        languages,
                        selector,
                        debug,
                        defer,
                        // Meaningful even when this config never cloaks: the
                        // attribute may be hand-written under a strict CSP.
                        cloakTimeout: cloak === false ? CLOAK_REVEAL_TIMEOUT_MS : cloak.timeout,
                    });
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
                const tags: HtmlTagDescriptor[] = [];
                if (cloak !== false) {
                    // Style plus a synchronous (non-module) attribute setter:
                    // both apply before first paint, so cloaked candidates
                    // are never painted natively. The runtime reveals.
                    if (cloak.style) {
                        tags.push({
                            tag: "style",
                            children: cloakCss(selector),
                            injectTo: "head",
                        });
                    }
                    tags.push({
                        tag: "script",
                        children: `document.documentElement.setAttribute(${JSON.stringify(CLOAK_ATTRIBUTE)}, "");`,
                        injectTo: "head",
                    });
                }
                tags.push({
                    tag: "script",
                    attrs: { type: "module" },
                    children: `import ${JSON.stringify(AUTO_MODULE_ID)};`,
                    injectTo: "head",
                });
                return tags;
            },
        };
    }

    return plugin;
}

export default vitePluginJustif;

export { BUNDLED_LANGUAGE_IDS } from "./languages.js";
export type { JustifLanguage } from "./languages.js";
export { CORE_MODULE_ID, AUTO_MODULE_ID } from "./virtual.js";
