/**
 * The browser-side auto-enhancement bootstrap for the plugin's
 * `virtual:justif/auto` module — and, via `vite-plugin-justif/runtime/auto`,
 * for anyone who wants the same drop-in behavior from their own entry.
 *
 * Mirrors justif's drop-in `auto` entry (src/auto.ts): scan candidate
 * elements whose computed `text-align` is `justify`/`justify-all`, group them
 * by (language, resolved `--justif-*` configuration), and call `justify()`
 * once per group with the matching bundled hyphenator. The result is exposed
 * at `window.justif` with the same escape hatch shape as the CDN script, and
 * returned so programmatic callers never need the global.
 *
 * Languages are loaded on demand and concurrently: the generated auto module
 * hands a `loaders` table that resolves each language through a Vite
 * code-split chunk, so a page in English pays for English patterns only —
 * like the drop-in script, which fetches one pattern file per language the
 * page actually uses.
 *
 * Boot timing follows the drop-in too: the page is read once the DOM is
 * parsed, or — with `defer`, the drop-in's `data-justif-defer` — one task
 * after DOMContentLoaded, so scripts that rewrite text (math rendering,
 * syntax highlighting) on that event have finished first.
 *
 * Not reproduced from the drop-in: dynamic per-language pattern loading
 * through runtime-built specifiers (the plugin's static-string imports are
 * the bundler-safe replacement) and the transition-watcher that applies CSS
 * changes live (call `reconfigure()` instead).
 *
 * Importing this module is SSR-safe: nothing runs until `bootAuto()` is
 * called, and `bootAuto()` no-ops (returns undefined) outside a browser.
 */
import {
    justify,
    unjustify,
    type JustifyController,
    type JustifyOptions,
    type LayoutOptions,
} from "justif";
import { CLOAK_ATTRIBUTE, CLOAK_REVEAL_TIMEOUT_MS } from "../cloak.js";
import { CSS_PROPERTIES, parseCssConfiguration, type CssProperty } from "./config.js";
import { DEFAULT_SELECTOR, resolveJustifLanguage } from "../languages.js";

export type Hyphenator = (word: string) => readonly string[];

/**
 * Lazy per-language loader. Must resolve to the language's hyphenator, or
 * `undefined` when the language has no pattern (spacing-only justification —
 * justif's graceful degradation).
 */
export type HyphenatorLoader = () => Promise<Hyphenator | undefined>;

export interface AutoBootOptions {
    /**
     * Per-language lazy loaders; the keys define the available language set.
     * The generated `virtual:justif/auto` module builds one entry per bundled
     * language, each a static-string `import()` Vite splits into its own
     * chunk. Defaults to `{}` — every group justifies spacing-only.
     */
    loaders?: Readonly<Record<string, HyphenatorLoader>>;
    /** Candidate selector; defaults to justif's stock list. */
    selector?: string;
    /**
     * Log a reason for every paragraph kept on native layout, and any
     * `--justif-*` property the parser does not recognize.
     */
    debug?: boolean;
    /**
     * Read the page one task after DOMContentLoaded instead of as soon as the
     * DOM is parsed: after every deferred and module script and every
     * DOMContentLoaded listener. For pages whose own scripts rewrite text that
     * late (KaTeX, a syntax highlighter). Costs the first-frame guarantee —
     * native justification may paint first — so prefer script order where
     * possible. The drop-in's `data-justif-defer`. Defaults to `false`.
     */
    defer?: boolean;
    /** Called per declined paragraph; the drop-in's `onSkip` equivalent. */
    onSkip?: JustifyOptions["onSkip"];
    /**
     * When the page is cloaked (`data-justif-cloak` on `<html>`), reveal
     * after this many milliseconds even if enhancement has not settled.
     * Defaults to 1500. `false` disables the fallback — reveal on booted
     * only. Ignored on uncloaked pages.
     */
    cloakTimeout?: number | false;
}

/** What `bootAuto` returns and exposes at `window.justif`. */
export interface JustifAutoHandle {
    justify: typeof justify;
    unjustify: typeof unjustify;
    /** The active controllers; rebuilt in place across `reconfigure()`. */
    controllers: JustifyController[];
    /** Settles once every group's fonts settled and layout converged. Does
     * not re-arm across `reconfigure()`. */
    booted: Promise<void>;
    /**
     * Re-read the `--justif-*` configuration and rebuild controllers.
     * Unlike the CDN script there is no watcher; changes apply when this
     * is called. Resolves once the rebuilt controllers have settled; a no-op
     * before the boot has run (a deferred one, or one waiting on
     * DOMContentLoaded).
     */
    reconfigure: () => Promise<void>;
}

interface Group {
    id: string | null;
    options: LayoutOptions;
    els: HTMLElement[];
}

declare global {
    interface Window {
        justif?: JustifAutoHandle;
    }
}

const KNOWN_PROPERTIES = new Set<string>(CSS_PROPERTIES);

/**
 * Under `debug`, report `--justif-*` properties the parser does not recognize:
 * a misspelled custom property is otherwise silently ignored. Best-effort,
 * like the drop-in's — engines need not enumerate custom properties.
 */
function reportUnknownProperties(style: CSSStyleDeclaration, el: Element): void {
    try {
        for (let i = 0; i < style.length; i++) {
            const name = style.item(i);
            if (!name.startsWith("--justif-") || KNOWN_PROPERTIES.has(name)) continue;
            console.info("justif: unrecognized property", name, "on", el);
        }
    } catch {
        // Enumeration unsupported: nothing to report.
    }
}

/** Uncover cloaked candidates (no-op on an uncloaked page). */
function revealCloak(): void {
    document.documentElement.removeAttribute(CLOAK_ATTRIBUTE);
}

/**
 * Run the auto-enhancement. Safe to call repeatedly (that is what
 * `reconfigure` does): controllers are destroyed and the scan rebuilt.
 * Returns the same handle it assigns to `window.justif`, or `undefined`
 * outside a browser.
 */
export function bootAuto(options: AutoBootOptions = {}): JustifAutoHandle | undefined {
    if (typeof document === "undefined") return undefined;

    const loaders = options.loaders ?? {};
    const available = new Set(Object.keys(loaders));
    const selector = options.selector ?? DEFAULT_SELECTOR;
    const debug = options.debug ?? false;
    const onSkip: JustifyOptions["onSkip"] =
        options.onSkip ??
        (debug ? (p, reason) => console.info("justif: skipped", p, "—", reason) : undefined);

    /** One warning per property-and-value pair, kept across reconfigure(),
     * as the drop-in does: a bad rule hits every paragraph it matches. */
    const warned = new Set<string>();

    /**
     * Group the current candidates. Paragraphs carrying `data-justif` are
     * already enhanced by a live controller and are left alone — the same
     * "adopted" recognition the drop-in performs (an enhanced paragraph no
     * longer computes to `justify`, since its `text-align` was overridden).
     */
    const collectGroups = (): Group[] => {
        const groups = new Map<string, Group>();
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
            if (el.hasAttribute("data-justif")) continue;
            const style = getComputedStyle(el);
            const align = style.textAlign;
            if (align !== "justify" && align !== "justify-all") continue;
            const lang = el.closest("[lang]")?.getAttribute("lang") ?? "";
            const id = resolveJustifLanguage(lang, available);
            const {
                options: layout,
                key,
                invalid,
            } = parseCssConfiguration((property: CssProperty) => style.getPropertyValue(property));
            for (const { property, value } of invalid) {
                const pair = `${property}:${value}`;
                if (warned.has(pair)) continue;
                warned.add(pair);
                console.warn(`justif: invalid ${property} value "${value}" — using the default`);
            }
            if (debug) reportUnknownProperties(style, el);
            // Same separators as the drop-in: U+0000 between the halves, U+0001
            // standing in for "no pattern module" — neither can appear in a BCP 47
            // tag or a configuration key, so no two groups can collide.
            const groupKey = `${id ?? "\u0001"}\u0000${key}`;
            const group = groups.get(groupKey);
            if (group === undefined) {
                groups.set(groupKey, { id, options: layout, els: [el] });
            } else {
                group.els.push(el);
            }
        }
        const collected = [...groups.values()];
        if (debug) {
            for (const { id, options: layout, els } of collected) {
                console.info("justif: group", {
                    language: id ?? "(unbundled: spacing only)",
                    options: layout,
                    paragraphs: els.length,
                });
            }
        }
        return collected;
    };

    /**
     * Enhance the current candidates into the shared `controllers` array.
     * Groups commit concurrently, each as soon as its hyphenator (or its
     * absence) is known; unlabeled and English-only pages therefore never wait
     * on another language's chunk. A group whose loader rejects is dropped —
     * its paragraphs keep native layout — without blocking the others. A group
     * without a pattern module gets spacing-only justification, exactly like
     * the drop-in.
     */
    const start = (controllers: JustifyController[]): Promise<void> =>
        Promise.allSettled(
            collectGroups().map(async (group) => {
                const hyphenate = group.id === null ? undefined : await loaders[group.id]?.();
                controllers.push(justify(group.els, { ...group.options, hyphenate, onSkip }));
            }),
        ).then(() => undefined);

    const controllers: JustifyController[] = [];
    /**
     * The end of the latest scan or rebuild; undefined until the boot has run.
     * Every reconfigure() queues behind it, so two calls never scan at once: a
     * scan that overlapped another, still waiting on its hyphenator, would
     * find the same paragraphs unenhanced and start a second controller each.
     */
    let pending: Promise<void> | undefined;
    let resolveBooted!: () => void;
    const booted = new Promise<void>((resolve) => {
        resolveBooted = resolve;
    });
    // Idempotent: under `defer` several signals race to start it.
    const boot = (): void => {
        if (pending !== undefined) return;
        pending = start(controllers);
        void pending
            .then(() => Promise.allSettled(controllers.map((c) => c.ready)))
            .then(() => resolveBooted());
    };
    // The drop-in's timing. `defer` waits on the event rather than queuing a
    // task now: a deferred script still downloading makes the parser yield,
    // and a task queued now would beat the very script it should follow.
    // `load` covers a boot that starts after DOMContentLoaded already fired.
    if (options.defer) {
        const afterDispatch = (): void => void setTimeout(boot, 0);
        if (document.readyState === "complete") afterDispatch();
        else {
            document.addEventListener("DOMContentLoaded", afterDispatch, { once: true });
            window.addEventListener("load", afterDispatch, { once: true });
        }
    } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    // Cloak reveal: if the page hid its candidates pre-paint (the plugin's
    // `cloak` option, or a hand-written attribute under CSP), uncover them
    // once layout settled — or after the timeout regardless, so a hung chunk
    // request can never trap content.
    if (document.documentElement.hasAttribute(CLOAK_ATTRIBUTE)) {
        const timeout = options.cloakTimeout ?? CLOAK_REVEAL_TIMEOUT_MS;
        const fallback = timeout === false ? undefined : setTimeout(revealCloak, timeout);
        void booted.then(() => {
            if (fallback !== undefined) clearTimeout(fallback);
            revealCloak();
        });
    }

    const handle: JustifAutoHandle = {
        justify,
        unjustify,
        // The stable array the drop-in documents; rebuilt in place so held
        // references keep working across reconfigure().
        controllers,
        booted,
        reconfigure(): Promise<void> {
            if (pending === undefined) return Promise.resolve();
            const rebuilt = pending.then(() => {
                for (const controller of controllers) controller.destroy();
                controllers.length = 0;
                return start(controllers);
            });
            // Claimed synchronously, before any caller can chain on the old
            // tail. Only the scan is queued on, not font settling, and a
            // rebuild that throws must not wedge every later call.
            pending = rebuilt.catch(() => undefined);
            return rebuilt
                .then(() => Promise.allSettled(controllers.map((c) => c.ready)))
                .then(() => undefined);
        },
    };
    window.justif = handle;
    return handle;
}
