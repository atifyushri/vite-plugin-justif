/**
 * BCP 47 -> bundled language id resolution, mirroring justif's drop-in
 * `moduleFor` (src/auto.ts) so the plugin's auto-enhancement picks the same
 * hyphenator the CDN script would. Shared between the runtime auto module
 * (browser) and the plugin API (Node, for server-side derivation).
 */
import { BUNDLED_LANGUAGE_IDS, type JustifLanguage } from "./constants.js";

const ALL = new Set<string>(BUNDLED_LANGUAGE_IDS);

/**
 * Resolve a `lang` attribute value to a bundled language id.
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
