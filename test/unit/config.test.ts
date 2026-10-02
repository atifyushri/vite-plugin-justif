/**
 * Behavioral tests for the `--justif-*` configuration parser — the guard for
 * upstream mirror #2 (src/runtime/config.ts), which ports justif's
 * auto-options logic that parity tests cannot check mechanically.
 */
import { hangingCharacters } from "justif";
import { describe, it, expect } from "vitest";
import {
    CSS_PROPERTIES,
    parseCssConfiguration,
    type CssProperty,
} from "../../src/runtime/config.js";

function parse(values: Partial<Record<CssProperty, string>>) {
    return parseCssConfiguration((property) => values[property] ?? "");
}

describe("parseCssConfiguration", () => {
    it("returns empty options and key when nothing is set", () => {
        const { options, key } = parse({});
        expect(options).toEqual({});
        expect(key).toBe("");
    });

    it("ignores auto and empty values", () => {
        const { options, key } = parse({
            "--justif-expansion": "auto",
            "--justif-tracking": "   ",
        });
        expect(options).toEqual({});
        expect(key).toBe("");
    });

    it("maps none per property semantics", () => {
        const { options } = parse({
            "--justif-hanging-punctuation": "none",
            "--justif-expansion": "none",
            "--justif-tracking": "none",
            "--justif-last-line-min-width": "none",
        });
        expect(options).toEqual({
            hangingPunctuation: "none",
            expansion: false,
            tracking: false,
            lastLineMinWidth: 0,
        });
    });

    it("treats true/false as the auto/none keywords", () => {
        expect(parse({ "--justif-expansion": "false" }).options).toEqual({
            expansion: false,
        });
        expect(parse({ "--justif-expansion": "true" }).options).toEqual({});
    });

    it("parses fractions and percentages identically", () => {
        expect(parse({ "--justif-expansion": "0.04" }).options).toEqual({
            expansion: { max: 0.04, shrink: 0.04 },
        });
        expect(parse({ "--justif-expansion": "4%" }).options).toEqual({
            expansion: { max: 0.04, shrink: 0.04 },
        });
    });

    it("drops values matching the library default (no key, no option)", () => {
        // layoutDefaults.expansion = { max: 0.02, shrink: 0.02 } and
        // hangingPunctuation = "line-end-only" in justif 0.9.
        const { options, key } = parse({
            "--justif-expansion": "0.02",
            "--justif-hanging-punctuation": "line-end-only",
        });
        expect(options).toEqual({});
        expect(key).toBe("");
    });

    it("ignores invalid values like CSS does, reporting them as written", () => {
        const { options, key, invalid } = parse({
            "--justif-expansion": "bogus",
            "--justif-tracking": "-1",
            "--justif-hanging-punctuation": "everything",
            // The table-backed protrusion model is API-only.
            "--justif-protrusion": "0.5",
            // `none` means nothing for a spacing limit.
            "--justif-space-stretch": "none",
        });
        expect(options).toEqual({});
        expect(key).toBe("");
        expect(invalid).toEqual([
            { property: "--justif-hanging-punctuation", value: "everything" },
            { property: "--justif-protrusion", value: "0.5" },
            { property: "--justif-expansion", value: "bogus" },
            { property: "--justif-tracking", value: "-1" },
            { property: "--justif-space-stretch", value: "none" },
        ]);
    });

    it("reports nothing invalid for unset, auto and default values", () => {
        expect(parse({ "--justif-expansion": "auto" }).invalid).toEqual([]);
        expect(parse({ "--justif-expansion": "2%" }).invalid).toEqual([]);
    });

    it("clamps last-line fractions to 1", () => {
        expect(parse({ "--justif-last-line-min-width": "150%" }).options).toEqual({
            lastLineMinWidth: 1,
        });
    });

    it("merges the two spacing halves into one object", () => {
        const { options } = parse({
            "--justif-space-stretch": "0.6",
            "--justif-space-shrink": "0.25",
        });
        expect(options).toEqual({ spacing: { stretch: 0.6, shrink: 0.25 } });
    });

    it("serializes a stable grouping key in property order", () => {
        const values = {
            "--justif-tracking": "none",
            "--justif-expansion": "0.04",
            "--justif-hanging-punctuation": "all-line-edges",
        } as const;
        const { key } = parse(values);
        expect(key).toBe("hanging-punctuation:all-line-edges;expansion:0.040000;tracking:none");
        // Same configuration, same key — the controller-sharing contract.
        expect(parse({ ...values }).key).toBe(key);
    });

    it("keys float-equal values identically (fixed precision)", () => {
        const a = parse({ "--justif-space-shrink": "0.1" }).key;
        const b = parse({ "--justif-space-shrink": "10%" }).key;
        expect(a).toBe(b);
        expect(a).toBe("space-shrink:0.100000");
    });

    it("parses hanging character sets as CSS strings, keyed on the set", () => {
        const { options, key } = parse({ "--justif-hanging-characters-start": `"“‘(["` });
        expect(options).toEqual({ hangingPunctuation: { characters: { start: "“‘([" } } });
        // Order and repeats are one configuration.
        expect(parse({ "--justif-hanging-characters-start": `'[(‘““'` }).key).toBe(key);
        expect(key).toBe(`hanging-characters-start:${[..."“‘(["].toSorted().join("")}`);
    });

    it("resolves CSS string escapes, including invalid hex to U+FFFD", () => {
        expect(parse({ "--justif-hanging-characters-end": `"\\2E\\2C x\\""` }).options).toEqual({
            hangingPunctuation: { characters: { end: '.,x"' } },
        });
        expect(parse({ "--justif-hanging-characters-end": `"\\0 \\D800"` }).options).toEqual({
            hangingPunctuation: { characters: { end: "\uFFFD\uFFFD" } },
        });
    });

    it("maps none to an empty side and rejects unquoted sets", () => {
        expect(parse({ "--justif-hanging-characters-end": "none" })).toEqual({
            options: { hangingPunctuation: { characters: { end: "" } } },
            key: "hanging-characters-end:none",
            invalid: [],
        });
        expect(parse({ "--justif-hanging-characters-start": "abc" }).invalid).toEqual([
            { property: "--justif-hanging-characters-start", value: "abc" },
        ]);
    });

    it("treats the built-in character sets as the default", () => {
        const reversed = [...hangingCharacters.end].toReversed().join("");
        const { options, key } = parse({
            "--justif-hanging-characters-start": JSON.stringify(hangingCharacters.start),
            "--justif-hanging-characters-end": JSON.stringify(reversed),
        });
        expect(options).toEqual({});
        expect(key).toBe("");
    });

    it("merges edges and character sides into one hanging option", () => {
        const { options, key } = parse({
            "--justif-hanging-punctuation": "all-line-edges",
            "--justif-hanging-characters-start": `"("`,
            "--justif-hanging-characters-end": "none",
        });
        expect(options).toEqual({
            hangingPunctuation: {
                edges: "all-line-edges",
                characters: { start: "(", end: "" },
            },
        });
        expect(key).toBe(
            "hanging-punctuation:all-line-edges;hanging-characters-start:(;hanging-characters-end:none",
        );
        // Edges alone keep the plain string form.
        expect(parse({ "--justif-hanging-punctuation": "none" }).options).toEqual({
            hangingPunctuation: "none",
        });
    });

    it("reads every property exactly once", () => {
        const read: string[] = [];
        parseCssConfiguration((property) => {
            read.push(property);
            return "";
        });
        expect(read).toEqual([...CSS_PROPERTIES]);
    });
});
