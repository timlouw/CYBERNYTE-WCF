import fs from 'fs';
import { Plugin } from 'esbuild';
import ts from 'typescript';
import type { CodeRemoval } from '../types.js';
import { createSourceFile, applyCodeRemovals } from '../utils/index.js';

/**
 * Register Component Return Stripper Plugin
 *
 * This plugin strips the return code from the registerComponent function at compile time.
 *
 * Why this is needed:
 * - The return code (createComponentHTMLSelector / template string) is only used at compile-time
 * - The component-precompiler and routes-precompiler already execute this at compile-time (CTFE)
 * - At runtime, registerComponent only needs to register the custom element
 * - Keeping the return code and the functions it calls (generateComponentHTML, createComponentHTMLSelector)
 *   bloats the runtime bundle unnecessarily
 *
 * What this plugin does:
 * 1. For shadow-dom.ts:
 *    - Removes the conditional return statement at the end of registerComponent
 *    - Removes the import of createComponentHTMLSelector (no longer needed at runtime)
 * 2. For services/index.ts:
 *    - Removes the re-export of component-html.js (only needed at compile-time)
 *
 * This effectively makes registerComponent a void function at runtime while
 * preserving the return types in the source for development type-checking.
 */
export const RegisterComponentStripperPlugin: Plugin = {
  name: 'register-component-stripper-plugin',
  setup(build) {
    // Handle shadow-dom.ts - strip the registerComponent return code
    build.onLoad({ filter: /shadow-dom\.ts$/ }, async (args) => {
      try {
        const source = await fs.promises.readFile(args.path, 'utf8');
        const sourceFile = createSourceFile(args.path, source);

        // Track positions to remove (process from bottom to top)
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
                  condition.right.text === 'page'
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
              // Check if it's importing createComponentHTMLSelector
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
                        // Include the comma if there is one
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

        console.log(`[RegisterComponent Stripper] Removing ${removals.length} code block(s) from shadow-dom.ts`);

        return {
          contents: applyCodeRemovals(source, removals),
          loader: 'ts',
        };
      } catch (err) {
        console.error('[RegisterComponent Stripper] Error processing file:', args.path, err);
        return undefined;
      }
    });

    // Handle services/index.ts - strip the component-html.js re-export
    build.onLoad({ filter: /services[/\\]index\.ts$/ }, async (args) => {
      try {
        const source = await fs.promises.readFile(args.path, 'utf8');
        const sourceFile = createSourceFile(args.path, source);

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

        console.log(`[RegisterComponent Stripper] Removing ${removals.length} export(s) from services/index.ts`);

        return {
          contents: applyCodeRemovals(source, removals),
          loader: 'ts',
        };
      } catch (err) {
        console.error('[RegisterComponent Stripper] Error processing file:', args.path, err);
        return undefined;
      }
    });
  },
};
