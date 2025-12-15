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
 *
 * mount(AppComponent, document.body);
 * ```
 */

/**
 * A registered page component returned by `registerComponent({ type: 'page' }, ...)`.
 * This is a template literal string type representing the component's HTML tag.
 */
type PageComponent = `<${string}></${string}>`;

/**
 * Declares the root component to bootstrap into the application.
 *
 * This function is a compile-time directive only - it gets completely
 * stripped from the final bundle. The compiler uses this call to:
 * 1. Identify the root component from the imported variable
 * 2. Resolve the component's selector from its definition
 * 3. Inject the component's HTML into index.html at build time
 *
 * @param component - The page component returned by `registerComponent({ type: 'page' }, ...)`
 * @param _target - The mount target (compile-time only, defaults to document.body)
 *
 * @example
 * ```typescript
 * import { mount } from '@framework/compiler/bootstrap';
 * import { AppComponent } from './pages/landing.js';
 *
 * // Bootstrap using the imported component
 * mount(AppComponent, document.body);
 * ```
 */
export function mount(component: PageComponent, _target?: Element | null): void {
  // This function body is intentionally empty.
  // It exists only to provide type checking at development time.
  // The compiler will:
  // 1. Find the imported component variable
  // 2. Trace it to its registerComponent() definition
  // 3. Extract the selector from that definition
  // 4. Strip this entire call from the output
  //
  // No runtime code is generated.
  void component;
}
