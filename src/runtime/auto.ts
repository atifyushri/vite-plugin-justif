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
import { parseCssConfiguration, type CssProperty } from "./config.js";
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
  /** Log a reason for every paragraph kept on native layout. */
  debug?: boolean;
  /** Called per declined paragraph; the drop-in's `onSkip` equivalent. */
  onSkip?: JustifyOptions["onSkip"];
}

/** What `bootAuto` returns and exposes at `window.justif`. */
export interface JustifAutoHandle {
  justify: typeof justify;
  unjustify: typeof unjustify;
  /** The active controllers; rebuilt in place across `reconfigure()`. */
  controllers: JustifyController[];
  /** Settles once every group's fonts settled and layout converged. */
  booted: Promise<void>;
  /**
   * Re-read the `--justif-*` configuration and rebuild controllers.
   * Unlike the CDN script there is no watcher; changes apply when this
   * is called. Resolves once the rebuilt controllers have settled.
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

/**
 * Run the auto-enhancement. Safe to call repeatedly (that is what
 * `reconfigure` does): controllers are destroyed and the scan rebuilt.
 * Returns the same handle it assigns to `window.justif`, or `undefined`
 * outside a browser.
 */
export function bootAuto(
  options: AutoBootOptions = {},
): JustifAutoHandle | undefined {
  if (typeof document === "undefined") return undefined;

  const loaders = options.loaders ?? {};
  const available = new Set(Object.keys(loaders));
  const selector = options.selector ?? DEFAULT_SELECTOR;
  const onSkip: JustifyOptions["onSkip"] =
    options.onSkip ??
    (options.debug
      ? (p, reason) => console.info("justif: skipped", p, "—", reason)
      : undefined);

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
      const { options, key } = parseCssConfiguration((property: CssProperty) =>
        style.getPropertyValue(property),
      );
      // Same separators as the drop-in: U+0000 between the halves, U+0001
      // standing in for "no pattern module" — neither can appear in a BCP 47
      // tag or a configuration key, so no two groups can collide.
      const groupKey = `${id ?? "\u0001"}\u0000${key}`;
      const group = groups.get(groupKey);
      if (group === undefined) {
        groups.set(groupKey, { id, options, els: [el] });
      } else {
        group.els.push(el);
      }
    }
    return [...groups.values()];
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
        const hyphenate =
          group.id === null ? undefined : await loaders[group.id]?.();
        controllers.push(
          justify(group.els, { ...group.options, hyphenate, onSkip }),
        );
      }),
    ).then(() => undefined);

  const controllers: JustifyController[] = [];
  let pending = start(controllers);
  const booted = pending
    .then(() => Promise.allSettled(controllers.map((c) => c.ready)))
    .then(() => undefined);

  const handle: JustifAutoHandle = {
    justify,
    unjustify,
    // The stable array the drop-in documents; rebuilt in place so held
    // references keep working across reconfigure().
    controllers,
    booted,
    reconfigure(): Promise<void> {
      return pending.then(async () => {
        for (const controller of controllers) controller.destroy();
        controllers.length = 0;
        pending = start(controllers);
        await pending;
        await Promise.allSettled(controllers.map((c) => c.ready));
      });
    },
  };
  window.justif = handle;
  return handle;
}
