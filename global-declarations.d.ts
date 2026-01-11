import { RoutesKeys } from './apps/client/router/routes.ts';

declare module '*.css';

declare global {
/** Tagged template literal for HTML */
  function html(strings: TemplateStringsArray, ...values: any[]): any;
  
  /** Tagged template literal for CSS */
  function css(strings: TemplateStringsArray, ...values: any[]): any;

  /** * Conditional Rendering
   * Usage: ${when(this.loading(), html`<p>Loading...</p>`, html`<p>Ready!</p>`)}
   */
  function when<T, F>(
    condition: boolean | (() => boolean), 
    thenTemplate?: T, 
    elseTemplate?: F
  ): T | F | string;

  /** * List Rendering
   * Usage: ${each(this.items(), (item) => html`<li>${item.name}</li>`)}
   */
  function repeat<T>(
    items: T[] | (() => T[]), 
    templateFn: (item: T, index: number) => any
  ): any[];

  // Navigation & Routing
  function navigate(path: RoutesKeys): void;
  function navigateBack(): void;
  function getRouteParam(paramName: string): string;
}

export {};
