import fs from 'fs';
import { Plugin } from 'esbuild';
import ts from 'typescript';
import { sourceCache, removeCode, logger, PLUGIN_NAME, COMPONENT_TYPE } from '../utils/index.js';
import type { CodeRemoval } from '../utils/source-editor.js';

const NAME = PLUGIN_NAME.STRIPPER;

/**
 * Register Component Return Stripper Plugin
 *
 * ## Why this is needed:
 * - The return code (createComponentHTMLSelector / template string) is only used at compile-time
 * - The component-precompiler and routes-precompiler already execute this at compile-time (CTFE)
 * - At runtime, registerComponent only needs to register the custom element
 * - Keeping the return code bloats the runtime bundle unnecessarily
 *
 * ## What this plugin does:
 *
 * ### For shadow-dom.ts:
 * ```typescript
 * // BEFORE:
 * function registerComponent(config) {
 *   customElements.define(config.selector, ...);
 *   if (config.type === 'page') {
 *     return createComponentHTMLSelector(config.selector);
 *   }
 *   return (...) => generateComponentHTML(...);
 * }
 *
 * // AFTER:
 * function registerComponent(config) {
 *   customElements.define(config.selector, ...);
 *   // return code stripped - function is now void at runtime
 * }
 * ```
 *
 * ### For services/index.ts:
 * - Removes the re-export of component-html.js (only needed at compile-time)
 */
export const RegisterComponentStripperPlugin: Plugin = {
  name: NAME,
  setup(build) {
    // Handle shadow-dom.ts - strip the registerComponent return code
    build.onLoad({ filter: /shadow-dom\.ts$/ }, async (args) => {
      try {
        const source = await fs.promises.readFile(args.path, 'utf8');
        const sourceFile = sourceCache.parse(args.path, source);

        // Track positions to remove
        const removals: CodeRemoval[] = [];

        const visit = (node: ts.Node) => {
          // Find the registerComponent function declaration
          if (ts.isFunctionDeclaration(node) && node.name?.text === 'registerComponent' && node.body) {
            // Find the if statement with the return code at the end of the function body
            for (const statement of node.body.statements) {
              if (ts.isIfStatement(statement)) {
                // Check if this is the "if (config.type === 'page')" statement
                const condition = statement.expression;
                if (
                  ts.isBinaryExpression(condition) &&
                  ts.isPropertyAccessExpression(condition.left) &&
                  condition.left.name.text === 'type' &&
                  ts.isStringLiteral(condition.right) &&
                  condition.right.text === COMPONENT_TYPE.PAGE
                ) {
                  // This is the return code block - mark it for removal
                  removals.push({
                    start: statement.getStart(sourceFile),
                    end: statement.getEnd(),
                    description: 'registerComponent return if-block',
                  });
                }
              }
            }
          }

          // Find and remove the import of createComponentHTMLSelector
          if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier) && moduleSpecifier.text.includes('component-html')) {
              const importClause = node.importClause;
              if (importClause?.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
                const imports = importClause.namedBindings.elements;
                const hasCreateComponentHTMLSelector = imports.some((el) => el.name.text === 'createComponentHTMLSelector');

                if (hasCreateComponentHTMLSelector) {
                  // If this is the only import, remove the entire import statement
                  if (imports.length === 1) {
                    removals.push({
                      start: node.getStart(sourceFile),
                      end: node.getEnd(),
                      description: 'createComponentHTMLSelector import',
                    });
                  } else {
                    // Otherwise, just remove the createComponentHTMLSelector from the named imports
                    for (const el of imports) {
                      if (el.name.text === 'createComponentHTMLSelector') {
                        let start = el.getStart(sourceFile);
                        let end = el.getEnd();

                        // Check for trailing comma
                        const afterElement = source.substring(end, end + 10);
                        if (afterElement.trim().startsWith(',')) {
                          end = end + afterElement.indexOf(',') + 1;
                        } else {
                          // Check for leading comma
                          const beforeElement = source.substring(start - 10, start);
                          const commaIndex = beforeElement.lastIndexOf(',');
                          if (commaIndex !== -1) {
                            start = start - (10 - commaIndex);
                          }
                        }

                        removals.push({
                          start,
                          end,
                          description: 'createComponentHTMLSelector named import',
                        });
                        break;
                      }
                    }
                  }
                }
              }
            }
          }

          ts.forEachChild(node, visit);
        };

        visit(sourceFile);

        if (removals.length === 0) {
          return undefined;
        }

        logger.info(NAME, `Removing ${removals.length} code block(s) from shadow-dom.ts`);

        return {
          contents: removeCode(source, removals),
          loader: 'ts',
        };
      } catch (error) {
        logger.error(NAME, `Error processing ${args.path}`, error);
        return undefined;
      }
    });

    // Handle services/index.ts - strip the component-html.js re-export
    build.onLoad({ filter: /services[/\\]index\.ts$/ }, async (args) => {
      try {
        const source = await fs.promises.readFile(args.path, 'utf8');
        const sourceFile = sourceCache.parse(args.path, source);

        const removals: CodeRemoval[] = [];

        const visit = (node: ts.Node) => {
          // Find: export * from './component-html.js'
          if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            if (ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.includes('component-html')) {
              removals.push({
                start: node.getStart(sourceFile),
                end: node.getEnd(),
                description: 'component-html.js re-export',
              });
            }
          }

          ts.forEachChild(node, visit);
        };

        visit(sourceFile);

        if (removals.length === 0) {
          return undefined;
        }

        logger.info(NAME, `Removing ${removals.length} export(s) from services/index.ts`);

        return {
          contents: removeCode(source, removals),
          loader: 'ts',
        };
      } catch (error) {
        logger.error(NAME, `Error processing ${args.path}`, error);
        return undefined;
      }
    });
  },
};
