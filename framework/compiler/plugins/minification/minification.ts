/**
 * Minification Plugin - Production-only HTML/CSS and Selector Minification
 *
 * This plugin performs two types of minification on the final bundled output:
 *
 * 1. **Selector Minification**: Replaces user-defined custom element selectors
 *    (e.g., `<ui-landing-page>`) with short sequential selectors (`<a-a>`, `<a-b>`, etc.)
 *
 * 2. **Template Minification**: Minifies content inside template literals:
 *    - HTML: Collapses whitespace, removes comments, strips space between tags
 *    - CSS: Removes comments, collapses whitespace, strips space around punctuation
 *
 * ## Usage
 *
 * This plugin requires `write: false` in esbuild config to access outputFiles.
 * It processes the output and writes files to disk itself.
 *
 * ## Example Transformations
 *
 * Selectors:
 * ```
 * Before: <ui-landing-page></ui-landing-page>
 * After:  <a-a></a-a>
 * ```
 *
 * HTML Templates:
 * ```
 * Before: `<div class="container">
 *            <span>Hello</span>
 *          </div>`
 * After:  `<div class="container"><span>Hello</span></div>`
 * ```
 *
 * CSS Templates:
 * ```
 * Before: `.box {
 *            width: 100%;
 *            height: 20px;
 *          }`
 * After:  `.box{width:100%;height:20px}`
 * ```
 */
import fs from 'fs';
import path from 'path';
import { Plugin } from 'esbuild';
import { SelectorMap, applySelectorsToSource, extractSelectorsFromSource } from './selector-minifier.js';
import { minifyTemplatesInSource } from './template-minifier.js';
import { logger } from '../../utils/index.js';

const NAME = 'minification';

// Global selector map shared across the build
const selectorMap = new SelectorMap();

/**
 * Minification Plugin for esbuild
 *
 * **Important**: This plugin requires `write: false` in esbuild options
 * to access and modify the output files before writing to disk.
 */
export const MinificationPlugin: Plugin = {
  name: NAME,
  setup(build) {
    // Clear selector map at start of each build
    build.onStart(() => {
      selectorMap.clear();
    });

    // Process output files after bundling
    build.onEnd(async (result) => {
      // Only process if we have output files (write: false mode)
      if (!result.outputFiles || result.outputFiles.length === 0) {
        return;
      }

      const startTime = performance.now();

      // Phase 1: Collect all selectors from all JS files
      for (const file of result.outputFiles) {
        if (file.path.endsWith('.js')) {
          const content = new TextDecoder().decode(file.contents);
          const selectors = extractSelectorsFromSource(content);

          for (const selector of selectors) {
            selectorMap.register(selector);
          }
        }
      }

      if (selectorMap.size > 0) {
        logger.info(NAME, `Registered ${selectorMap.size} selector(s) for minification`);
      }

      // Phase 2: Apply minification to all JS files
      let totalSaved = 0;

      for (let i = 0; i < result.outputFiles.length; i++) {
        const file = result.outputFiles[i];

        if (file.path.endsWith('.js')) {
          const originalContent = new TextDecoder().decode(file.contents);
          const originalSize = file.contents.length;

          // Apply selector minification
          let minifiedContent = applySelectorsToSource(originalContent, selectorMap);

          // Apply template minification
          minifiedContent = minifyTemplatesInSource(minifiedContent);

          // Update the output file
          const newContents = new TextEncoder().encode(minifiedContent);
          const savedBytes = originalSize - newContents.length;
          totalSaved += savedBytes;

          // Create new OutputFile with minified content
          result.outputFiles[i] = {
            path: file.path,
            contents: newContents,
            text: minifiedContent,
            hash: file.hash,
          };
        }
      }

      // Phase 3: Write all output files to disk
      const distDir = path.dirname(result.outputFiles[0].path);
      await fs.promises.mkdir(distDir, { recursive: true });

      await Promise.all(
        result.outputFiles.map(async (file) => {
          const dir = path.dirname(file.path);
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(file.path, file.contents);
        }),
      );

      const elapsed = (performance.now() - startTime).toFixed(2);
      const savedKB = (totalSaved / 1024).toFixed(2);

      if (totalSaved > 0) {
        logger.info(NAME, `Minified ${result.outputFiles.filter((f) => f.path.endsWith('.js')).length} file(s), saved ${savedKB} KB in ${elapsed}ms`);
      }

      // Log selector mappings for debugging (optional)
      if (selectorMap.size > 0) {
        const mappings: string[] = [];
        for (const [original, minified] of selectorMap.entries()) {
          mappings.push(`${original} → ${minified}`);
        }
        logger.info(NAME, `Selector mappings: ${mappings.join(', ')}`);
      }
    });
  },
};

/**
 * Get the current selector map (useful for other plugins to apply selector minification)
 */
export const getSelectorMap = (): SelectorMap => selectorMap;

/**
 * Apply selector minification to any HTML string using the current selector map.
 * Useful for minifying index.html or other HTML files.
 */
export const minifySelectorsInHTML = (html: string): string => {
  if (selectorMap.size === 0) return html;
  return applySelectorsToSource(html, selectorMap);
};
