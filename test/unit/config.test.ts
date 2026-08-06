/**
 * Behavioral tests for the `--justif-*` configuration parser — the guard for
 * upstream mirror #2 (src/runtime/config.ts), which ports justif's
 * auto-options logic that parity tests cannot check mechanically.
 */
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
        // hangingPunctuation = "line-end-only" in justif 0.7.
        const { options, key } = parse({
            "--justif-expansion": "0.02",
            "--justif-hanging-punctuation": "line-end-only",
        });
        expect(options).toEqual({});
        expect(key).toBe("");
    });

    it("ignores invalid values like CSS does", () => {
        const { options, key } = parse({
            "--justif-expansion": "bogus",
            "--justif-tracking": "-1",
            "--justif-hanging-punctuation": "everything",
            // The table-backed protrusion model is API-only.
            "--justif-protrusion": "0.5",
        });
        expect(options).toEqual({});
        expect(key).toBe("");
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

    it("reads every property exactly once", () => {
        const read: string[] = [];
        parseCssConfiguration((property) => {
            read.push(property);
            return "";
        });
        expect(read).toEqual([...CSS_PROPERTIES]);
    });
});
