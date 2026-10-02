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
            const els = [...targets];
            for (const el of els) el.setAttribute("data-justif", "");
            return {
                ready: Promise.resolve(),
                // Like justif's own: tearing down restores the native paragraph.
                destroy: () => {
                    destroyed.push(index);
                    for (const el of els) el.removeAttribute("data-justif");
                },
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

        addParagraph("Second scan.");
        await handle.reconfigure();

        // Torn down, then the whole page rescanned: old and new paragraphs alike.
        expect(destroyed).toEqual([0]);
        expect(handle.controllers).toBe(controllers);
        expect(controllers).toHaveLength(1);
        expect(justifyCalls[1]!.els.map((el) => el.textContent)).toEqual([
            "First scan.",
            "Second scan.",
        ]);
    });

    it("serializes overlapping reconfigure() calls instead of enhancing twice", async () => {
        const en = addParagraph("One paragraph.");
        const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
        await handle.booted;
        const controllers = handle.controllers;

        // Called back to back, as a theme toggle and a resize handler might.
        await Promise.all([handle.reconfigure(), handle.reconfigure()]);

        // Every paragraph is managed by exactly one live controller.
        expect(controllers).toHaveLength(1);
        expect(justifyCalls).toHaveLength(3);
        expect(justifyCalls.every((call) => call.els.length === 1 && call.els[0] === en)).toBe(
            true,
        );
        expect(destroyed.toSorted()).toEqual([0, 1]);
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

    it("cloakTimeout: false disables the fallback — reveal on booted only", async () => {
        vi.useFakeTimers();
        try {
            document.documentElement.setAttribute("data-justif-cloak", "");
            addParagraph("A paragraph.");
            let release!: (h: undefined) => void;
            const gate = new Promise<undefined>((resolve) => (release = resolve));
            const handle = bootAuto({
                cloakTimeout: false,
                loaders: { "en-us": () => gate },
            })!;
            await vi.advanceTimersByTimeAsync(60_000);
            expect(document.documentElement.hasAttribute("data-justif-cloak")).toBe(true);
            release(undefined);
            await handle.booted;
            await Promise.resolve();
            expect(document.documentElement.hasAttribute("data-justif-cloak")).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it("warns once per invalid property-and-value pair", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            for (let i = 0; i < 3; i++) {
                addParagraph("Badly configured.").style.setProperty("--justif-expansion", "bogus");
            }
            const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
            await handle.booted;
            // Invalid values fall back to the default: still one group.
            expect(justifyCalls).toHaveLength(1);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0]![0]).toContain('--justif-expansion value "bogus"');
        } finally {
            warn.mockRestore();
        }
    });

    it("defer reads the page one task after DOMContentLoaded, after its listeners", async () => {
        vi.useFakeTimers();
        const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("interactive");
        try {
            // Not yet a candidate: a later DOMContentLoaded listener makes it one,
            // so a scan that runs during the dispatch (or before it) finds nothing.
            const p = addParagraph("Rewritten by a late script.");
            p.style.textAlign = "left";
            const handle = bootAuto({
                defer: true,
                loaders: { "en-us": async () => undefined },
            })!;
            document.addEventListener("DOMContentLoaded", () => (p.style.textAlign = "justify"), {
                once: true,
            });
            // Published immediately, with the controllers array to be filled.
            expect(window.justif).toBe(handle);
            // Nothing boots on timers alone, however long they run.
            await vi.advanceTimersByTimeAsync(1000);
            expect(justifyCalls).toHaveLength(0);
            // A no-op until the boot has run, rather than a premature scan.
            await handle.reconfigure();
            await vi.advanceTimersByTimeAsync(0);
            expect(justifyCalls).toHaveLength(0);

            document.dispatchEvent(new Event("DOMContentLoaded"));
            await vi.advanceTimersByTimeAsync(0);
            await handle.booted;
            expect(justifyCalls).toHaveLength(1);
            expect(justifyCalls[0]!.els).toEqual([p]);

            // `load` arriving afterwards must not boot a second time.
            window.dispatchEvent(new Event("load"));
            await vi.advanceTimersByTimeAsync(0);
            expect(justifyCalls).toHaveLength(1);
            expect(handle.controllers).toHaveLength(1);
        } finally {
            readyState.mockRestore();
            vi.useRealTimers();
        }
    });

    it("defer falls back to load when DOMContentLoaded was already missed", async () => {
        vi.useFakeTimers();
        const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("interactive");
        try {
            addParagraph("Injected late.");
            const handle = bootAuto({
                defer: true,
                loaders: { "en-us": async () => undefined },
            })!;
            await vi.advanceTimersByTimeAsync(1000);
            expect(justifyCalls).toHaveLength(0);
            window.dispatchEvent(new Event("load"));
            await vi.advanceTimersByTimeAsync(0);
            await handle.booted;
            expect(justifyCalls).toHaveLength(1);
        } finally {
            readyState.mockRestore();
            vi.useRealTimers();
        }
    });

    it("defer boots after one task when the document is already complete", async () => {
        vi.useFakeTimers();
        try {
            addParagraph("Already loaded.");
            const handle = bootAuto({
                defer: true,
                loaders: { "en-us": async () => undefined },
            })!;
            // Not synchronously: the scan waits for the queued task.
            await Promise.resolve();
            await Promise.resolve();
            expect(justifyCalls).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(0);
            await handle.booted;
            expect(justifyCalls).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("waits for DOMContentLoaded when called while the document is loading", async () => {
        const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
        try {
            addParagraph("Parsed later.");
            const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
            // Long enough for a premature boot's loader and justify() to land.
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(justifyCalls).toHaveLength(0);
            document.dispatchEvent(new Event("DOMContentLoaded"));
            await handle.booted;
            expect(justifyCalls).toHaveLength(1);
        } finally {
            readyState.mockRestore();
        }
    });

    it("leaves an uncloaked page alone", async () => {
        addParagraph("A paragraph.");
        const handle = bootAuto({ loaders: { "en-us": async () => undefined } })!;
        await handle.booted;
        expect(document.documentElement.hasAttribute("data-justif-cloak")).toBe(false);
    });
});
