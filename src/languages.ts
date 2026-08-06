/**
 * Everything mirrored from justif's drop-in surface, in one place: the
 * bundled hyphenation languages (package.json `./hyphenate/*` exports), the
 * naming conventions of their modules, the BCP 47 resolution the drop-in's
 * `moduleFor` performs (src/auto.ts), and the stock candidate selector.
 *
 * justif does not export these internals, so they are hand-ported here.
 * `test/unit/parity.test.ts` checks this file against the installed justif
 * dist so upstream drift fails the test run instead of degrading silently.
 * The one other upstream mirror is `runtime/config.ts` (the `--justif-*`
 * parser).
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

const ALL = new Set<string>(BUNDLED_LANGUAGE_IDS);

/**
 * Resolve a `lang` attribute value to a bundled language id, mirroring the
 * drop-in's `moduleFor` so the plugin's auto-enhancement picks the same
 * hyphenator the CDN script would.
 *
 * - "" (unlabeled) and generic English -> "en-us"
 * - "en-gb" -> "en-gb", any other `en-*` -> "en-us"
 * - plain "no" -> "nb" (Bokmål), "nn" stays "nn"
 * - anything else matches on its primary subtag
 *
 * Returns null when the tag has no bundled pattern (or when `subset` is
 * given and does not include the matching id), meaning spacing-only
 * justification — the same graceful degradation justif's auto performs.
 */
export function resolveJustifLanguage(
  lang: string,
  subset?: ReadonlySet<string>,
): JustifLanguage | null {
  const norm = lang.toLowerCase().replace(/_/g, "-");
  let id: string;
  if (norm === "") {
    id = "en-us";
  } else if (norm === "en-gb") {
    id = "en-gb";
  } else if (norm === "en" || norm.startsWith("en-")) {
    id = "en-us";
  } else {
    const primary = norm.split("-")[0]!;
    id = primary === "no" ? "nb" : primary;
  }
  const known = subset ?? ALL;
  return known.has(id) ? (id as JustifLanguage) : null;
}
