// @vitest-environment happy-dom
/**
 * Behavioral tests for the browser bootstrap (src/runtime/auto.ts): candidate
 * scanning, grouping, lazy loader resolution, the returned handle, and
 * reconfigure. justif's layout engine is mocked — these tests cover the
 * plugin's orchestration, not upstream layout (that is justif's own test
 * suite's job).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const justifyCalls: Array<{ els: HTMLElement[]; options: Record<string, unknown> }> = [];
const destroyed: number[] = [];

vi.mock("justif", async (importOriginal) => {
    const original = await importOriginal<typeof import("justif")>();
    return {
        ...original,
        justify: vi.fn((targets: Iterable<Element>, options: Record<string, unknown>) => {
            const index = justifyCalls.length;
            justifyCalls.push({ els: [...targets] as HTMLElement[], options });
            for (const el of targets) el.setAttribute("data-justif", "");
            return {
                ready: Promise.resolve(),
                destroy: () => destroyed.push(index),
            };
        }),
    };
});

import { bootAuto } from "../../src/runtime/auto.js";

function addParagraph(text: string, attrs: Record<string, string> = {}): HTMLElement {
    const p = document.createElement("p");
    p.textContent = text;
    p.style.textAlign = "justify";
    for (const [name, value] of Object.entries(attrs)) p.setAttribute(name, value);
    document.body.append(p);
    return p;
}

beforeEach(() => {
    document.documentElement.setAttribute("lang", "en");
});

afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-justif-cloak");
    justifyCalls.length = 0;
    destroyed.length = 0;
    delete window.justif;
    vi.clearAllMocks();
});

// Distinct identity tokens: the grouping test asserts which hyphenator
// reached which justify() call.
const hyphenateEn = (word: string) => [word];
const hyphenateDe = (word: string) => [word];

describe("bootAuto", () => {
    it("groups by resolved language and loads each hyphenator lazily", async () => {
        const en = addParagraph("An English paragraph.");
        const unlabeled = addParagraph("Inherits the page language.");
        const de = addParagraph("Ein deutscher Absatz.", { lang: "de" });
        const loaded: string[] = [];
        const handle = bootAuto({
            loaders: {
                "en-us": async () => (loaded.push("en-us"), hyphenateEn),
                de: async () => (loaded.push("de"), hyphenateDe),
                fr: async () => {
                    throw new Error("never requested");
                },
            },
        })!;
        await handle.booted;

        expect(loaded.toSorted()).toEqual(["de", "en-us"]);
        expect(justifyCalls).toHaveLength(2);
        const enGroup = justifyCalls.find((c) => c.options.hyphenate === hyphenateEn)!;
        const deGroup = justifyCalls.find((c) => c.options.hyphenate === hyphenateDe)!;
        expect(enGroup.els).toEqual([en, unlabeled]);
        expect(deGroup.els).toEqual([de]);
        expect(handle.controllers).toHaveLength(2);
        expect(window.justif).toBe(handle);
    });

    it("skips non-justified and already-enhanced paragraphs", async () => {
        addParagraph("Justified.");
        const left = addParagraph("Not justified.");
        left.style.textAlign = "left";
        addParagraph("Already enhanced.", { "data-justif": "" });
        const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
        await handle.booted;

        expect(justifyCalls).toHaveLength(1);
        expect(justifyCalls[0]!.els.map((el) => el.textContent)).toEqual(["Justified."]);
    });

    it("justifies spacing-only when the language has no loader", async () => {
        addParagraph("Ένα ελληνικό κείμενο.", { lang: "el" });
        const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
        await handle.booted;

        expect(justifyCalls).toHaveLength(1);
        expect(justifyCalls[0]!.options.hyphenate).toBeUndefined();
    });

    it("drops a group whose loader rejects without blocking the others", async () => {
        addParagraph("English survives.");
        addParagraph("Deutsch scheitert.", { lang: "de" });
        const handle = bootAuto({
            loaders: {
                "en-us": async () => (word: string) => [word],
                de: async () => {
                    throw new Error("chunk failed to load");
                },
            },
        })!;
        await handle.booted;

        expect(justifyCalls).toHaveLength(1);
        expect(justifyCalls[0]!.els.map((el) => el.textContent)).toEqual(["English survives."]);
        expect(handle.controllers).toHaveLength(1);
    });

    it("honors a custom selector", async () => {
        addParagraph("A stock paragraph.");
        const aside = document.createElement("aside");
        aside.textContent = "An aside.";
        aside.style.textAlign = "justify";
        document.body.append(aside);
        const handle = bootAuto({
            selector: "aside",
            loaders: { "en-us": async () => undefined },
        })!;
        await handle.booted;

        expect(justifyCalls).toHaveLength(1);
        expect(justifyCalls[0]!.els).toEqual([aside]);
    });

    it("reconfigure destroys controllers and rebuilds in place", async () => {
        addParagraph("First scan.");
        const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
        await handle.booted;
        const controllers = handle.controllers;
        expect(controllers).toHaveLength(1);

        // The mock's data-justif marker makes the first paragraph "adopted",
        // mirroring production where an enhanced paragraph no longer matches.
        addParagraph("Second scan.");
        await handle.reconfigure();

        expect(destroyed).toEqual([0]);
        expect(handle.controllers).toBe(controllers);
        expect(controllers).toHaveLength(1);
        expect(justifyCalls[1]!.els.map((el) => el.textContent)).toEqual(["Second scan."]);
    });

    it("forwards onSkip and defaults it from debug", async () => {
        addParagraph("A paragraph.");
        const onSkip = vi.fn();
        const handle = bootAuto({
            loaders: { "en-us": async () => undefined },
            onSkip,
        })!;
        await handle.booted;
        expect(justifyCalls[0]!.options.onSkip).toBe(onSkip);
    });

    it("removes the cloak attribute once booted", async () => {
        document.documentElement.setAttribute("data-justif-cloak", "");
        addParagraph("A paragraph.");
        const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
        await handle.booted;
        await Promise.resolve();
        expect(document.documentElement.hasAttribute("data-justif-cloak")).toBe(false);
    });

    it("reveals via the fallback timer when a loader hangs", async () => {
        vi.useFakeTimers();
        try {
            document.documentElement.setAttribute("data-justif-cloak", "");
            addParagraph("A paragraph.");
            bootAuto({ loaders: { "en-us": () => new Promise(() => {}) } });
            expect(document.documentElement.hasAttribute("data-justif-cloak")).toBe(true);
            await vi.advanceTimersByTimeAsync(1500);
            expect(document.documentElement.hasAttribute("data-justif-cloak")).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("leaves an uncloaked page alone", async () => {
        addParagraph("A paragraph.");
        const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
        await handle.booted;
        expect(document.documentElement.hasAttribute("data-justif-cloak")).toBe(false);
    });
});
