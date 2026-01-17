/**
 * Compile-Time Bootstrap Directive
 *
 * This module provides a declarative way to specify which component
 * should be bootstrapped as the root of the application.
 *
 * IMPORTANT: This is a compile-time only directive. The `mount` function
 * is completely stripped from the output bundle - it has NO runtime cost.
 *
 * The compiler scans for `mount()` calls to determine:
 * - Which component to inject into index.html
 * - Where the component should be mounted (defaults to document.body)
 *
 * @example
 * ```typescript
 * import { mount } from '@framework/compiler/bootstrap';
 * import { AppComponent } from './pages/landing.js';
 * import globalStyles from './assets/global.css';
 *
 * mount(AppComponent, {
 *   target: document.body,
 *   styles: [globalStyles]
 * });
 * ```
 */

import { registerGlobalStyles } from '../runtime/dom/index.js';

/**
 * A registered page component returned by `registerComponent({ type: 'page' }, ...)`.
 * This is a template literal string type representing the component's HTML tag.
 */
type PageComponent = `<${string}></${string}>`;

/**
 * Mount configuration options
 */
interface MountOptions {
  /** The DOM element to mount the component into (defaults to document.body) */
  target?: Element | null;
  /** Global CSS styles to apply to all Shadow DOM components */
  styles?: string[];
}

/**
 * Declares the root component to bootstrap into the application.
 *
 * This function handles both compile-time and runtime concerns:
 * - Compile-time: The compiler extracts the component to inject into index.html
 * - Runtime: Registers global styles and creates the root element
 *
 * @param component - The page component returned by `registerComponent({ type: 'page' }, ...)`
 * @param options - Mount configuration (target element and global styles)
 *
 * @example
 * ```typescript
 * import { mount } from '@framework/compiler/bootstrap';
 * import { AppComponent } from './pages/landing.js';
 * import globalStyles from './assets/global.css';
 * import themeStyles from './assets/theme.css';
 *
 * mount(AppComponent, {
 *   styles: [globalStyles, themeStyles]
 * });
 * ```
 */
export function mount(component: PageComponent, options: MountOptions = {}): void {
  const { target = document.body, styles = [] } = options;

  // Register global styles FIRST (before any components initialize)
  if (styles.length > 0) {
    registerGlobalStyles(...styles);
  }

  // Extract tag name from the component string (e.g., "<my-app></my-app>" -> "my-app")
  const match = component.match(/^<([a-z][a-z0-9-]*)>/i);
  if (!match || !target) return;

  // Dynamically create and append the element
  const element = document.createElement(match[1]);
  target.appendChild(element);
}
