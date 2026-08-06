/**
 * The cloak contract, shared by the plugin (which injects the hiding style
 * and sets the attribute pre-paint) and the runtime (which reveals).
 * Deliberately free of imports: index.ts must stay clear of browser code and
 * runtime/auto.ts clear of Node code.
 */

/** Set on <html> while candidates are hidden; removed to reveal. Public
 * contract: CSP setups write it in their HTML source by hand, and consumer
 * CSS may key transitions off it. */
export const CLOAK_ATTRIBUTE = "data-justif-cloak";

/** Reveal no later than this, enhanced or not — the cloak must never trap
 * content behind a hung chunk request or a broken script. */
export const CLOAK_REVEAL_TIMEOUT_MS = 1500;

/** The injected hiding rule: only candidates, only while <html> carries the
 * attribute. `:is()` is a forgiving selector list, so one bad selector part
 * cannot void the rule. */
export function cloakCss(selector: string): string {
    return `html[${CLOAK_ATTRIBUTE}] :is(${selector}) { visibility: hidden; }`;
}
