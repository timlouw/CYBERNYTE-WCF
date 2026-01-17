import { RoutesKeys } from './apps/client/router/routes.ts';

// CSS module declarations are in framework/runtime/wcf-modules.d.ts

declare global {
  /** Tagged template literal for HTML */
  function html(strings: TemplateStringsArray, ...values: any[]): any;

  /** Tagged template literal for CSS */
  function css(strings: TemplateStringsArray, ...values: any[]): any;

  /**
   * Conditional Element Directive
   * Place on an element to show/hide it based on condition.
   * Usage: <div "${when(this.loading())}">Loading...</div>
   */
  function when(condition: boolean | (() => boolean)): string;

  /**
   * Conditional Content Rendering
   * Use inline in template to render one of two templates based on condition.
   * Usage: ${whenElse(this.loading(), html`<p>Loading...</p>`, html`<p>Ready!</p>`)}
   */
  function whenElse<T, F>(condition: boolean | (() => boolean), thenTemplate: T, elseTemplate: F): T | F;

  /**
   * List Rendering with Automatic Keying
   * Renders a list of items with efficient diffing using LIS algorithm.
   * Items are automatically keyed based on their content (primitives by value,
   * objects by id/key/_id property).
   *
   * Features:
   * - Fragment support: Item template can have multiple root elements
   * - Empty state: Optional third argument shows when list is empty
   * - Automatic keying: No manual key management needed
   * - LIS optimization: Minimal DOM moves during reordering
   * - Custom trackBy: Optional fourth argument for custom key extraction
   *
   * @example
   * // Basic usage
   * ${repeat(this.items(), (item) => html`<li>${item.name}</li>`)}
   *
   * // With index
   * ${repeat(this.items(), (item, index) => html`<li>${index}: ${item}</li>`)}
   *
   * // Fragment (multiple root elements)
   * ${repeat(this.items(), (item) => html`<dt>${item.term}</dt><dd>${item.def}</dd>`)}
   *
   * // Empty state
   * ${repeat(this.items(), (item) => html`<li>${item}</li>`, html`<p>No items</p>`)}
   *
   * // Custom trackBy
   * ${repeat(this.items(), (item) => html`<li>${item.name}</li>`, null, (item) => item.uniqueId)}
   */
  function repeat<T>(items: T[] | (() => T[]), templateFn: (item: T, index: number) => any, emptyTemplate?: any, trackBy?: (item: T, index: number) => string | number): any[];

  // Navigation & Routing
  function navigate(path: RoutesKeys): void;
  function navigateBack(): void;
  function getRouteParam(paramName: string): string;
}

export {};
