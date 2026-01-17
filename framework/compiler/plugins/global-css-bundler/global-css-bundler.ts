import fs from 'fs';
import { Plugin } from 'esbuild';
import { isProd } from '../../config.js';
import { PLUGIN_NAME } from '../../utils/index.js';

const NAME = PLUGIN_NAME.GLOBAL_CSS_BUNDLER;

/**
 * Global CSS Bundler Plugin - Pre-bundles CSS files at compile time
 *
 * ## What it does:
 * 1. Intercepts .css imports and exports them as strings
 * 2. Minifies CSS in production mode
 * 3. Inlines as string constant in the bundle
 * 4. Eliminates runtime fetch for maximum performance
 *
 * ## Usage:
 * ```typescript
 * import globalStyles from './assets/global.css';
 * import themeStyles from './assets/theme.css';
 *
 * mount(AppComponent, {
 *   styles: [globalStyles, themeStyles]
 * });
 * ```
 *
 * ## Why pre-bundle?
 * - Zero network requests at runtime
 * - CSS is available synchronously when components initialize
 * - Smaller total payload (bundled + compressed with JS)
 * - No FOUC (Flash of Unstyled Content)
 */
export const GlobalCSSBundlerPlugin: Plugin = {
  name: NAME,
  setup(build) {
    // Intercept all .css file imports
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      try {
        // Read CSS file
        let cssContent = await fs.promises.readFile(args.path, 'utf8');

        // Minify CSS in production
        if (isProd) {
          cssContent = minifyCSS(cssContent);
        }

        // Export as default string
        return {
          contents: `export default ${JSON.stringify(cssContent)};`,
          loader: 'ts',
        };
      } catch (error) {
        console.warn(`[${NAME}] CSS file not found: ${args.path}`);
        return {
          contents: `export default '';`,
          loader: 'ts',
        };
      }
    });
  },
};

/**
 * Simple CSS minifier for production builds
 * Removes comments, extra whitespace, and newlines
 */
function minifyCSS(css: string): string {
  return (
    css
      // Remove comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove newlines and extra spaces
      .replace(/\s+/g, ' ')
      // Remove space around special characters
      .replace(/\s*([{}:;,>+~])\s*/g, '$1')
      // Remove trailing semicolons before closing braces
      .replace(/;}/g, '}')
      // Remove leading/trailing whitespace
      .trim()
  );
}
