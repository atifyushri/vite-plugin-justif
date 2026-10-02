/**
 * The plugin's virtual modules: their ids and their code generation.
 *
 * Both modules use fully static import specifiers, so Vite can resolve and
 * bundle every hyphenation language — the thing justif's drop-in script
 * cannot do under a bundler (its language modules load via dynamically built
 * `./hyphenate/<id>.js` specifiers that no build can follow, silently
 * degrading to spacing-only for every language but en-US).
 *
 * `virtual:justif` statically imports every selected language: an explicit
 * import should be fully bundled. `virtual:justif/auto` instead generates
 * STATIC-STRING dynamic imports, which Vite code-splits into per-language
 * chunks that load on demand — the same progressive behavior as the CDN
 * script, with every language still shipped and resolvable by the build.
 */
import { languageModuleId, hyphenatorExportName, type JustifLanguage } from "./languages.js";

/** Virtual module exposing the core API plus every selected hyphenator. */
export const CORE_MODULE_ID = "virtual:justif";
/** Virtual module that auto-enhances the page on import. */
export const AUTO_MODULE_ID = "virtual:justif/auto";
/** Resolved (null-byte-prefixed) ids, as seen by the `load` hook. */
export const RESOLVED_CORE_MODULE_ID = "\0" + CORE_MODULE_ID;
export const RESOLVED_AUTO_MODULE_ID = "\0" + AUTO_MODULE_ID;

export interface AutoModuleOptions {
    /** Bundled languages the generated auto entry ships (as lazy chunks). */
    languages: readonly JustifLanguage[];
    /** Candidate selector for the auto-enhancement scan. */
    selector: string;
    /** Log a reason for every paragraph kept on native layout. */
    debug: boolean;
    /** Boot one task after DOMContentLoaded (justif's `data-justif-defer`). */
    defer: boolean;
    /** Cloak fallback reveal in ms, or `false` for reveal-on-booted only. */
    cloakTimeout: number | false;
}

function languageImports(languages: readonly JustifLanguage[]): string {
    return languages
        .map(
            (id) =>
                `import { ${hyphenatorExportName(id)} } from ${JSON.stringify(languageModuleId(id))};`,
        )
        .join("\n");
}

function hyphenatorTable(languages: readonly JustifLanguage[]): string {
    const rows = languages.map((id) => `  ${JSON.stringify(id)}: ${hyphenatorExportName(id)},`);
    return `{\n${rows.join("\n")}\n}`;
}

function loaderTable(languages: readonly JustifLanguage[]): string {
    const rows = languages.map((id) => {
        const name = hyphenatorExportName(id);
        return (
            `    ${JSON.stringify(id)}: () => ` +
            `import(${JSON.stringify(languageModuleId(id))}).then((m) => m.${name}),`
        );
    });
    return `{\n${rows.join("\n")}\n  }`;
}

/**
 * `virtual:justif` — the core API plus a ready-made hyphenator map:
 *
 *   import { justify, hyphenators } from "virtual:justif";
 *
 *   justify(document.querySelectorAll("p:lang(de)"), {
 *     hyphenate: hyphenators.de,
 *   });
 */
export function generateCoreModule(languages: readonly JustifLanguage[]): string {
    return [
        `export * from "justif";`,
        languageImports(languages),
        `export const hyphenators = ${hyphenatorTable(languages)};`,
        "",
    ].join("\n");
}

/**
 * `virtual:justif/auto` — justif's drop-in auto-enhancement, bundled. On
 * import it scans the DOM (once ready), groups paragraphs by language and
 * resolved `--justif-*` configuration, and calls `justify` per group — the
 * same orchestration as justif's `auto` entry, minus the CDN-only dynamic
 * specifier building. Each language lives in its own on-demand chunk.
 *
 * `bootAuto` lives in the plugin's own runtime module (exported as
 * `vite-plugin-justif/runtime/auto`) so the browser-side logic is authored
 * once, type-checked, and shared with consumers who want the same bootstrap
 * without the HTML injection.
 */
export function generateAutoModule(options: AutoModuleOptions): string {
    return [
        `import { bootAuto } from "vite-plugin-justif/runtime/auto";`,
        "",
        `bootAuto({`,
        `  selector: ${JSON.stringify(options.selector)},`,
        `  debug: ${options.debug},`,
        `  defer: ${options.defer},`,
        `  cloakTimeout: ${JSON.stringify(options.cloakTimeout)},`,
        `  loaders: ${loaderTable(options.languages)},`,
        `});`,
        "",
    ].join("\n");
}
