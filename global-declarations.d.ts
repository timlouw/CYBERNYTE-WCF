import { RoutesKeys } from './apps/client/router/routes.ts';

declare module '*.css';

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

  /** * List Rendering
   * Usage: ${each(this.items(), (item) => html`<li>${item.name}</li>`)}
   */
  function repeat<T>(items: T[] | (() => T[]), templateFn: (item: T, index: number) => any): any[];

  // Navigation & Routing
  function navigate(path: RoutesKeys): void;
  function navigateBack(): void;
  function getRouteParam(paramName: string): string;
}

export {};
