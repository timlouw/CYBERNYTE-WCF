/**
 * Selector Minifier - Generates short, unique custom element selectors
 *
 * Custom elements require a hyphen in their name (Web Components spec).
 * This generates sequential selectors: a-a, a-b, ..., a-z, b-a, b-b, etc.
 *
 * @example
 * // Original: <ui-landing-page>, <my-element>, <custom-button>
 * // Minified: <a-a>, <a-b>, <a-c>
 */

// Characters used for selector generation (lowercase letters only for valid custom elements)
const CHARS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Generates a sequential minified selector.
 * Format: {prefix}-{suffix} where both are base-26 encoded.
 *
 * @param index - Zero-based index for the selector
 * @returns Minified selector string (e.g., 'a-a', 'a-b', 'b-a')
 */
export const generateMinifiedSelector = (index: number): string => {
  // For first 26 selectors: a-a through a-z
  // For next 26: b-a through b-z, etc.
  const prefixIndex = Math.floor(index / CHARS.length);
  const suffixIndex = index % CHARS.length;

  // Convert to base-26 string for prefix (handles > 676 selectors)
  let prefix = '';
  let remaining = prefixIndex;
  do {
    prefix = CHARS[remaining % CHARS.length] + prefix;
    remaining = Math.floor(remaining / CHARS.length) - 1;
  } while (remaining >= 0);

  const suffix = CHARS[suffixIndex];

  return `${prefix}-${suffix}`;
};

/**
 * Selector mapping from original to minified.
 * Maintains consistent mapping across the entire build.
 */
export class SelectorMap {
  private originalToMinified = new Map<string, string>();
  private minifiedToOriginal = new Map<string, string>();
  private nextIndex = 0;

  /**
   * Register an original selector and get its minified version.
   * If already registered, returns the existing minified selector.
   */
  register(originalSelector: string): string {
    const existing = this.originalToMinified.get(originalSelector);
    if (existing) {
      return existing;
    }

    const minified = generateMinifiedSelector(this.nextIndex++);
    this.originalToMinified.set(originalSelector, minified);
    this.minifiedToOriginal.set(minified, originalSelector);
    return minified;
  }

  /**
   * Get the minified selector for an original (returns undefined if not registered)
   */
  getMinified(original: string): string | undefined {
    return this.originalToMinified.get(original);
  }

  /**
   * Get the original selector from a minified one
   */
  getOriginal(minified: string): string | undefined {
    return this.minifiedToOriginal.get(minified);
  }

  /**
   * Get all registered mappings
   */
  entries(): IterableIterator<[string, string]> {
    return this.originalToMinified.entries();
  }

  /**
   * Get the count of registered selectors
   */
  get size(): number {
    return this.originalToMinified.size;
  }

  /**
   * Clear all mappings (for fresh builds)
   */
  clear(): void {
    this.originalToMinified.clear();
    this.minifiedToOriginal.clear();
    this.nextIndex = 0;
  }
}

/**
 * Apply selector minification to source code.
 * Replaces all occurrences of original selectors with their minified versions.
 *
 * Handles:
 * - HTML tags: <original-selector> and </original-selector>
 * - String literals: 'original-selector' and "original-selector"
 * - Template content: `<original-selector>`
 */
export const applySelectorsToSource = (source: string, selectorMap: SelectorMap): string => {
  let result = source;

  for (const [original, minified] of selectorMap.entries()) {
    // Escape special regex characters in selector (hyphens are special in regex)
    const escaped = original.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

    // Replace in HTML tags: <selector> and </selector>
    // Also handles <selector attr="value"> patterns
    result = result.replace(new RegExp(`<${escaped}(\\s|>|/)`, 'g'), `<${minified}$1`);
    result = result.replace(new RegExp(`</${escaped}>`, 'g'), `</${minified}>`);

    // Replace in string literals (for customElements.define, etc.)
    // Matches 'selector' or "selector" but not partial matches
    result = result.replace(new RegExp(`(['"])${escaped}\\1`, 'g'), `$1${minified}$1`);
  }

  return result;
};

/**
 * Extract selectors from JavaScript source by finding registerComponent calls
 * or customElements.define patterns.
 *
 * Looks for patterns like:
 * - selector: 'my-element'
 * - selector: "my-element"
 */
export const extractSelectorsFromSource = (source: string): string[] => {
  const selectors: string[] = [];

  // Match selector property in object literals: selector: 'value' or selector: "value"
  const selectorRegex = /selector:\s*(['"])([a-z][a-z0-9]*-[a-z0-9-]+)\1/gi;

  let match;
  while ((match = selectorRegex.exec(source)) !== null) {
    const selector = match[2];
    if (!selectors.includes(selector)) {
      selectors.push(selector);
    }
  }

  return selectors;
};
