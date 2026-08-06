/**
 * Shared constants for the plugin. These mirror justif's drop-in surface:
 * the bundled hyphenation languages (package.json `./hyphenate/*` exports),
 * the auto-enhancement candidate selector, and the virtual module ids.
 */

/** Every language justif bundles hyphenation patterns for. */
export const BUNDLED_LANGUAGE_IDS = [
  "ca",
  "da",
  "de",
  "el",
  "en-gb",
  "en-us",
  "es",
  "fi",
  "fr",
  "hr",
  "hu",
  "it",
  "nb",
  "nl",
  "nn",
  "pl",
  "pt",
  "ru",
  "sk",
  "sl",
  "sv",
  "tr",
  "uk",
] as const;

export type JustifLanguage = (typeof BUNDLED_LANGUAGE_IDS)[number];

/** justif's drop-in default candidate selector (src/auto.ts). */
export const DEFAULT_SELECTOR = "p, li, dd, blockquote, figcaption";

/** Virtual module exposing the core API plus every selected hyphenator. */
export const CORE_MODULE_ID = "virtual:justif";
/** Virtual module that auto-enhances the page on import. */
export const AUTO_MODULE_ID = "virtual:justif/auto";
/** Resolved (null-byte-prefixed) ids, as seen by the `load` hook. */
export const RESOLVED_CORE_MODULE_ID = "\0" + CORE_MODULE_ID;
export const RESOLVED_AUTO_MODULE_ID = "\0" + AUTO_MODULE_ID;

/** A hyphenator's export name in justif, e.g. "en-us" -> `hyphenateEnUS`.
 * First subtag is CamelCased; trailing subtags are uppercased in full
 * (the package's own convention: `en-gb` -> `hyphenateEnGB`). */
export function hyphenatorExportName(id: string): string {
  const [head, ...tail] = id.split("-");
  const base = head!.charAt(0).toUpperCase() + head!.slice(1);
  return "hyphenate" + base + tail.map((part) => part.toUpperCase()).join("");
}

/** The package subpath a language module is imported from, e.g. "justif/hyphenate/de". */
export function languageModuleId(id: string): string {
  return `justif/hyphenate/${id}`;
}
