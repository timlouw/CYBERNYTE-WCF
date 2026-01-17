/**
 * Type declarations for WCF module handling
 * CSS imports are resolved at compile time by esbuild plugins
 */

/**
 * CSS file imports are converted to string exports at compile time.
 *
 * @example
 * ```typescript
 * import globalStyles from './assets/global.css';
 * import themeStyles from './assets/theme.css';
 *
 * mount(AppComponent, {
 *   styles: [globalStyles, themeStyles]
 * });
 * ```
 */
declare module '*.css' {
  /** CSS content as a string (inlined at compile time) */
  const css: string;
  export default css;
}
