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
import {
  AUTO_MODULE_ID,
  BUNDLED_LANGUAGE_IDS,
  CORE_MODULE_ID,
  DEFAULT_SELECTOR,
  RESOLVED_AUTO_MODULE_ID,
  RESOLVED_CORE_MODULE_ID,
  type JustifLanguage,
} from "./constants.js";
import {
  generateAutoModule,
  generateCoreModule,
  type AutoModuleOptions,
} from "./virtual.js";
import { resolveJustifLanguage } from "./lang.js";

export interface JustifVitePluginOptions {
  /**
   * Bundled hyphenation languages to include. Every selected language is
   * statically imported into the generated modules, so this is also a
   * bundle-size control: `["en-us", "de", "fr"]` ships only those pattern
   * files. Defaults to all 23 bundled languages.
   */
  languages?: readonly JustifLanguage[];
  /**
   * Inject the auto-enhancement entry into every HTML entry file. `true`
   * (the default) injects a module script that boots justif's auto behavior;
   * pass an object to set the candidate `selector` and `debug` logging, or
   * `false` to manage `virtual:justif/auto` yourself from your own entry
   * (useful under a strict Content-Security-Policy, where inline scripts are
   * blocked).
   */
  inject?:
    | boolean
    | {
        selector?: string;
        debug?: boolean;
      };
  /** Register `virtual:justif`. Defaults to `true`. */
  coreModule?: boolean;
  /** Register `virtual:justif/auto`. Defaults to `true`. */
  autoModule?: boolean;
}

export interface ResolvedJustifPluginOptions {
  languages: readonly JustifLanguage[];
  inject: { selector: string; debug: boolean } | false;
  coreModule: boolean;
  autoModule: boolean;
}

export function resolveJustifPluginOptions(
  options: JustifVitePluginOptions = {},
): ResolvedJustifPluginOptions {
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
  const inject =
    options.inject === false
      ? false
      : {
          selector:
            typeof options.inject === "object" && options.inject.selector !== undefined
              ? options.inject.selector
              : DEFAULT_SELECTOR,
          debug:
            typeof options.inject === "object" && options.inject.debug !== undefined
              ? options.inject.debug
              : false,
        };
  const coreModule = options.coreModule ?? true;
  const autoModule = options.autoModule ?? true;
  if (inject && !autoModule) {
    throw new Error(
      "vite-plugin-justif: HTML injection requires the auto module — " +
        "set autoModule: true or inject: false.",
    );
  }
  return { languages, inject, coreModule, autoModule };
}

/** `resolveId`/`load` filters: only our two virtual ids (with the null-byte
 * prefix once resolved, and optional query strings). Older bundlers that
 * ignore hook filters still hit the handlers, which null out cleanly. */
const ID_FILTER = /^virtual:justif([/?]|$)/;
const RESOLVED_ID_FILTER = /^\0virtual:justif([/?]|$)/;

export function vitePluginJustif(
  options: JustifVitePluginOptions = {},
): Plugin {
  const resolved = resolveJustifPluginOptions(options);
  const wantsCore = resolved.coreModule;
  const wantsAuto = resolved.autoModule;
  const autoOptions: AutoModuleOptions = {
    languages: resolved.languages,
    selector: resolved.inject ? resolved.inject.selector : DEFAULT_SELECTOR,
    debug: resolved.inject ? resolved.inject.debug : false,
  };

  const plugin: Plugin = {
    name: "vite-plugin-justif",
  };

  if (wantsCore || wantsAuto) {
    plugin.resolveId = {
      filter: { id: ID_FILTER },
      handler(id: string) {
        if (wantsCore && id === CORE_MODULE_ID) return RESOLVED_CORE_MODULE_ID;
        if (wantsAuto && id === AUTO_MODULE_ID) return RESOLVED_AUTO_MODULE_ID;
        return null;
      },
    };
    plugin.load = {
      filter: { id: RESOLVED_ID_FILTER },
      handler(id: string) {
        if (id === RESOLVED_CORE_MODULE_ID) {
          return wantsCore ? generateCoreModule(resolved.languages) : null;
        }
        if (id === RESOLVED_AUTO_MODULE_ID) {
          return wantsAuto ? generateAutoModule(autoOptions) : null;
        }
        return null;
      },
    };
  }

  if (resolved.inject) {
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

export {
  BUNDLED_LANGUAGE_IDS,
  CORE_MODULE_ID,
  AUTO_MODULE_ID,
  DEFAULT_SELECTOR,
} from "./constants.js";
export type { JustifLanguage } from "./constants.js";
export { generateCoreModule, generateAutoModule } from "./virtual.js";
export { resolveJustifLanguage } from "./lang.js";
export { bootAuto } from "./runtime/auto.js";
export type { AutoBootOptions, Hyphenator } from "./runtime/auto.js";
