/**
 * Parser for justif's declarative `--justif-*` configuration surface.
 *
 * A faithful port of the drop-in's src/auto-options.ts (justif, MIT): the same
 * property names, the same value grammar (`none`/`auto`/fractions/percent/
 * quoted character sets), the same defaults — and, critically, the same
 * serialized GROUPING KEY, so paragraphs this plugin configures share
 * controllers exactly where justif's own drop-in would share them.
 *
 * Only the parsing is kept: `@property` registration and the transition
 * watcher that make values live-update are CDN-script machinery and are not
 * reproduced here (see `window.justif.reconfigure()` for manual refresh).
 */
import {
    hangingCharacters,
    layoutDefaults,
    type HangingPunctuationOptions,
    type LayoutOptions,
} from "justif";

/** Every property, in the order the grouping key serializes them. */
export const CSS_PROPERTIES = [
    "--justif-hanging-punctuation",
    "--justif-hanging-characters-start",
    "--justif-hanging-characters-end",
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
    /** Declarations that could not be parsed, in the author's own spelling,
     * for the drop-in's once-per-pair warning. */
    invalid: Array<{ property: CssProperty; value: string }>;
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

/**
 * A CSS string's value: outer quotes removed and escapes resolved, so
 * `"\\2E\\2C"` and `".,"` are one set. Undefined when not a well-formed string.
 */
function parseCssString(raw: string): string | undefined {
    const quote = raw[0];
    if (raw.length < 2 || (quote !== '"' && quote !== "'") || raw.at(-1) !== quote) {
        return undefined;
    }
    const body = raw.slice(1, -1);
    let out = "";
    for (let i = 0; i < body.length; i++) {
        if (body[i] !== "\\") {
            out += body[i];
            continue;
        }
        const hex = /^[0-9a-fA-F]{1,6}/.exec(body.slice(i + 1));
        if (hex === null) {
            // A backslash escapes the character after it, including the quote.
            i += 1;
            out += body[i] ?? "";
            continue;
        }
        const code = Number.parseInt(hex[0], 16);
        // CSS Syntax §4.3.7: zero, surrogates and out-of-range hex escapes all
        // decode to U+FFFD.
        out +=
            code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff
                ? "\uFFFD"
                : String.fromCodePoint(code);
        i += hex[0].length;
        // One trailing whitespace (CRLF counting as one) terminates a hex escape.
        const after = body[i + 1];
        if (after === " " || after === "\t" || after === "\n" || after === "\f") i += 1;
        else if (after === "\r") i += body[i + 2] === "\n" ? 2 : 1;
    }
    return out;
}

/** Sorted, deduplicated code points: order and repeats are not a second
 * configuration, so they must not split a controller group. */
function canonicalSet(chars: string): string {
    // A fresh array, and `toSorted` is ES2023 while the runtime targets ES2020.
    // oxlint-disable-next-line unicorn/no-array-sort
    return [...new Set(chars)].sort().join("");
}

type ParsedOne = { options: LayoutOptions; keyPart: string } | "invalid" | "default";

function parseOne(property: CssProperty, raw: string): ParsedOne {
    if (raw === "none") {
        switch (property) {
            case "--justif-hanging-punctuation":
                return { options: { hangingPunctuation: "none" }, keyPart: "none" };
            // An empty side hangs nothing at that edge.
            case "--justif-hanging-characters-start":
                return {
                    options: { hangingPunctuation: { characters: { start: "" } } },
                    keyPart: "none",
                };
            case "--justif-hanging-characters-end":
                return {
                    options: { hangingPunctuation: { characters: { end: "" } } },
                    keyPart: "none",
                };
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
    if (
        property === "--justif-hanging-characters-start" ||
        property === "--justif-hanging-characters-end"
    ) {
        const side = property === "--justif-hanging-characters-start" ? "start" : "end";
        const chars = parseCssString(raw);
        if (chars === undefined) return "invalid";
        if (canonicalSet(chars) === canonicalSet(hangingCharacters[side])) return "default";
        return {
            options: { hangingPunctuation: { characters: { [side]: chars } } },
            keyPart: canonicalSet(chars),
        };
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

/** `true` is the drop-in's spelling of "the library default", which an
 * absent `edges` already means. */
function hangingAsObject(v: LayoutOptions["hangingPunctuation"]): HangingPunctuationOptions {
    return v === undefined || v === true ? {} : typeof v === "object" ? v : { edges: v };
}

/**
 * Fold one hanging-punctuation contribution into the earlier ones. The object
 * form appears only once a character side is named, so edges alone keep the
 * plain string form (and the grouping key it has always produced).
 */
function mergeHanging(
    into: LayoutOptions["hangingPunctuation"],
    add: LayoutOptions["hangingPunctuation"],
): LayoutOptions["hangingPunctuation"] {
    if (typeof into !== "object" && typeof add !== "object") return add;
    const a = hangingAsObject(into);
    const b = hangingAsObject(add);
    return {
        ...a,
        ...b,
        ...(a.characters !== undefined || b.characters !== undefined
            ? { characters: { ...a.characters, ...b.characters } }
            : {}),
    };
}

/**
 * Read the whole surface. `read` returns a property's computed value, or the
 * empty string when it is not set. Invalid values are ignored and the
 * library default applies — the same end state CSS produces for an invalid
 * declaration — and are returned in `invalid` for reporting.
 */
export function parseCssConfiguration(
    read: (property: CssProperty) => string,
): ParsedConfiguration {
    const options: LayoutOptions = {};
    const invalid: ParsedConfiguration["invalid"] = [];
    const keyParts: string[] = [];
    for (const property of CSS_PROPERTIES) {
        const raw = read(property).trim();
        const value = canonicalKeyword(raw);
        if (value === "" || value === "auto") continue;
        const parsed = parseOne(property, value);
        if (parsed === "invalid") {
            invalid.push({ property, value: raw });
            continue;
        }
        if (parsed === "default") continue;
        if (parsed.options.spacing !== undefined) {
            options.spacing = { ...options.spacing, ...parsed.options.spacing };
        } else if (parsed.options.hangingPunctuation !== undefined) {
            options.hangingPunctuation = mergeHanging(
                options.hangingPunctuation,
                parsed.options.hangingPunctuation,
            );
        } else {
            Object.assign(options, parsed.options);
        }
        keyParts.push(`${property.slice("--justif-".length)}:${parsed.keyPart}`);
    }
    return { options, key: keyParts.join(";"), invalid };
}
