/**
 * Parser for justif's declarative `--justif-*` configuration surface.
 *
 * A faithful port of the drop-in's auto-options.ts (justif, MIT): the same
 * property names, the same value grammar (`none`/`auto`/fractions/percent),
 * the same defaults — and, critically, the same serialized GROUPING KEY, so
 * paragraphs this plugin configures share controllers exactly where justif's
 * own drop-in would share them.
 *
 * Only the parsing is kept: `@property` registration and the transition
 * watcher that make values live-update are CDN-script machinery and are not
 * reproduced here (see `window.justif.reconfigure()` for manual refresh).
 */
import { layoutDefaults, type LayoutOptions } from "justif";

/** Every property, in the order the grouping key serializes them. */
export const CSS_PROPERTIES = [
    "--justif-hanging-punctuation",
    "--justif-protrusion",
    "--justif-expansion",
    "--justif-tracking",
    "--justif-last-line-min-width",
    "--justif-last-line-fit",
    "--justif-space-stretch",
    "--justif-space-shrink",
] as const;

export type CssProperty = (typeof CSS_PROPERTIES)[number];

export interface ParsedConfiguration {
    /** Only the fields set to something non-default. */
    options: LayoutOptions;
    /**
     * Canonical identity of the configuration: paragraphs sharing it can
     * share one controller. Empty when nothing was configured.
     */
    key: string;
}

const NUMERIC = /^([+-]?(?:\d+\.?\d*|\.\d+))(%?)$/;

/** `true` and `false` are the JS API's spellings of `auto` and `none`. */
function canonicalKeyword(raw: string): string {
    if (raw === "true") return "auto";
    if (raw === "false") return "none";
    return raw;
}

/** Fixed precision so float noise cannot fragment controller groups. */
function serialize(value: number): string {
    return value.toFixed(6);
}

/** A percentage, or the same fraction as the plain number the JS API takes. */
function parseFraction(raw: string): number | undefined {
    const match = NUMERIC.exec(raw);
    if (match === null) return undefined;
    const value = Number(match[1]) / (match[2] === "%" ? 100 : 1);
    if (!Number.isFinite(value) || value < 0) return undefined;
    return value;
}

type ParsedOne = { options: LayoutOptions; keyPart: string } | "invalid" | "default";

function parseOne(property: CssProperty, raw: string): ParsedOne {
    if (raw === "none") {
        switch (property) {
            case "--justif-hanging-punctuation":
                return { options: { hangingPunctuation: "none" }, keyPart: "none" };
            case "--justif-protrusion":
                return { options: { protrusion: false }, keyPart: "none" };
            case "--justif-expansion":
                return { options: { expansion: false }, keyPart: "none" };
            case "--justif-tracking":
                return { options: { tracking: false }, keyPart: "none" };
            case "--justif-last-line-min-width":
                return { options: { lastLineMinWidth: 0 }, keyPart: "0" };
            default:
                return "invalid";
        }
    }

    if (property === "--justif-hanging-punctuation") {
        if (
            raw === "line-end-only" ||
            raw === "first-line-and-line-ends" ||
            raw === "all-line-edges"
        ) {
            return raw === layoutDefaults.hangingPunctuation
                ? "default"
                : { options: { hangingPunctuation: raw }, keyPart: raw };
        }
        return "invalid";
    }
    // The table-backed protrusion model is API-only, like in the drop-in.
    if (property === "--justif-protrusion") return "invalid";

    const fraction = parseFraction(raw);
    if (fraction === undefined) return "invalid";

    switch (property) {
        case "--justif-expansion": {
            if (fraction === 0) return { options: { expansion: false }, keyPart: "none" };
            const { max, shrink } = layoutDefaults.expansion;
            if (max === fraction && shrink === fraction) return "default";
            return {
                options: { expansion: { max: fraction, shrink: fraction } },
                keyPart: serialize(fraction),
            };
        }
        case "--justif-tracking": {
            if (fraction === 0) return { options: { tracking: false }, keyPart: "none" };
            const { max, shrink } = layoutDefaults.tracking;
            if (max === fraction && shrink === fraction) return "default";
            return {
                options: { tracking: { max: fraction, shrink: fraction } },
                keyPart: serialize(fraction),
            };
        }
        case "--justif-last-line-min-width":
        case "--justif-last-line-fit": {
            const key =
                property === "--justif-last-line-min-width" ? "lastLineMinWidth" : "lastLineFit";
            const clamped = Math.min(1, fraction);
            if (clamped === layoutDefaults[key]) return "default";
            return { options: { [key]: clamped }, keyPart: serialize(clamped) };
        }
        default: {
            const key = property === "--justif-space-stretch" ? "stretch" : "shrink";
            if (clampedEquals(fraction, layoutDefaults.spacing[key])) return "default";
            return { options: { spacing: { [key]: fraction } }, keyPart: serialize(fraction) };
        }
    }
}

/** Compared at the grouping key's own precision. */
function clampedEquals(a: number, b: number): boolean {
    return serialize(a) === serialize(b);
}

/**
 * Read the whole surface. `read` returns a property's computed value, or the
 * empty string when it is not set. Invalid values are ignored and the
 * library default applies — the same end state CSS produces for an invalid
 * declaration.
 */
export function parseCssConfiguration(
    read: (property: CssProperty) => string,
): ParsedConfiguration {
    const options: LayoutOptions = {};
    const keyParts: string[] = [];
    for (const property of CSS_PROPERTIES) {
        const raw = read(property).trim();
        const value = canonicalKeyword(raw);
        if (value === "" || value === "auto") continue;
        const parsed = parseOne(property, value);
        if (parsed === "invalid" || parsed === "default") continue;
        if (parsed.options.spacing !== undefined) {
            options.spacing = { ...options.spacing, ...parsed.options.spacing };
        } else {
            Object.assign(options, parsed.options);
        }
        keyParts.push(`${property.slice("--justif-".length)}:${parsed.keyPart}`);
    }
    return { options, key: keyParts.join(";") };
}
