import fs from 'fs';
import path from 'path';
import { Plugin } from 'esbuild';
import ts from 'typescript';

interface PageSelectorInfo {
  importPath: string;
  selector: string;
}

/**
 * Extracts the selector from a page file by parsing its registerComponent call.
 * Pages use registerComponent with type: 'page' and export default.
 */
const extractPageSelector = async (pagePath: string): Promise<string | null> => {
  try {
    const source = await fs.promises.readFile(pagePath, 'utf8');
    const sourceFile = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    let selector: string | null = null;

    const visit = (node: ts.Node) => {
      // Find: export default registerComponent(...)
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        const expr = node.expression;
        if (ts.isCallExpression(expr)) {
          const callee = expr.expression;

          // Check if it's registerComponent call
          if (ts.isIdentifier(callee) && callee.text === 'registerComponent') {
            // Extract the config object (first argument)
            if (expr.arguments.length > 0) {
              const configArg = expr.arguments[0];
              if (ts.isObjectLiteralExpression(configArg)) {
                for (const prop of configArg.properties) {
                  if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                    if (prop.name.text === 'selector' && ts.isStringLiteral(prop.initializer)) {
                      selector = prop.initializer.text;
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (!selector) {
        ts.forEachChild(node, visit);
      }
    };

    visit(sourceFile);
    return selector;
  } catch (err) {
    console.error(`[Routes CTFE] Error reading page file: ${pagePath}`, err);
    return null;
  }
};

/**
 * Resolves the page file path from the import statement in routes.
 */
const resolvePagePath = (importPath: string, routesFilePath: string): string => {
  const routesDir = path.dirname(routesFilePath);

  // Convert .js import to .ts for source file
  let resolvedPath = importPath.replace(/\.js$/, '.ts');

  // Handle relative imports
  if (resolvedPath.startsWith('.')) {
    resolvedPath = path.resolve(routesDir, resolvedPath);
  }

  return resolvedPath;
};

/**
 * Extracts all dynamic imports from the routes file and their corresponding selectors.
 */
const extractRouteImports = async (source: string, sourceFile: ts.SourceFile, routesFilePath: string): Promise<Map<string, PageSelectorInfo>> => {
  const pageSelectors = new Map<string, PageSelectorInfo>();

  const visit = async (node: ts.Node) => {
    // Find arrow functions that contain dynamic imports: () => import('../pages/xxx.js')
    if (ts.isArrowFunction(node)) {
      const body = node.body;
      if (ts.isCallExpression(body)) {
        const expr = body.expression;
        // Check for import() calls
        if (expr.kind === ts.SyntaxKind.ImportKeyword && body.arguments.length > 0) {
          const importArg = body.arguments[0];
          if (ts.isStringLiteral(importArg)) {
            const importPath = importArg.text;
            const pagePath = resolvePagePath(importPath, routesFilePath);

            const selector = await extractPageSelector(pagePath);
            if (selector) {
              // Use the import path as key to match later
              pageSelectors.set(importPath, {
                importPath,
                selector,
              });
            }
          }
        }
      }
    }
  };

  // Collect all arrow functions and process them
  const collectNodes = (node: ts.Node): ts.ArrowFunction[] => {
    const nodes: ts.ArrowFunction[] = [];
    if (ts.isArrowFunction(node)) {
      nodes.push(node);
    }
    ts.forEachChild(node, (child) => {
      nodes.push(...collectNodes(child));
    });
    return nodes;
  };

  const arrowFunctions = collectNodes(sourceFile);
  for (const fn of arrowFunctions) {
    await visit(fn);
  }

  return pageSelectors;
};

/**
 * Routes Precompiler Plugin - CTFE for Route Selectors
 *
 * This plugin implements Compile-Time Function Evaluation for routes by:
 *
 * 1. Parsing the routes.ts file to find all dynamic imports
 * 2. For each import, parsing the corresponding page file
 * 3. Extracting the selector from the registerComponent call
 * 4. Injecting a 'selector' property with the fully rendered HTML tag
 *
 * The result is that routes have a pre-computed selector property like:
 *   selector: '<ui-landing-page></ui-landing-page>'
 *
 * This allows the router to use innerHTML directly without needing
 * to call module.default to get the component tag.
 */
export const routesPrecompilerPlugin: Plugin = {
  name: 'routes-precompiler-plugin',
  setup(build) {
    build.onLoad({ filter: /routes\.ts$/ }, async (args) => {
      try {
        // Only process the router/routes.ts file
        if (!args.path.includes('router')) {
          return undefined;
        }

        const source = await fs.promises.readFile(args.path, 'utf8');
        const sourceFile = ts.createSourceFile(args.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        // Extract all page selectors from dynamic imports
        const pageSelectors = await extractRouteImports(source, sourceFile, args.path);

        if (pageSelectors.size === 0) {
          return undefined;
        }

        console.log(`[Routes CTFE] Found ${pageSelectors.size} page selector(s) for compile-time injection`);

        let modifiedSource = source;

        // We need to process from bottom to top to maintain correct positions
        // Collect all objects first, then process in reverse order
        interface RouteObject {
          node: ts.ObjectLiteralExpression;
          importPath: string;
          lastPropEnd: number;
          needsComma: boolean;
        }

        const routeObjects: RouteObject[] = [];

        const collectRouteObjects = (node: ts.Node): void => {
          if (ts.isObjectLiteralExpression(node)) {
            let importPath: string | null = null;
            let hasSelector = false;
            let lastProp: ts.ObjectLiteralElementLike | null = null;

            for (const prop of node.properties) {
              lastProp = prop; // Track the last property
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                if (prop.name.text === 'componentModule') {
                  if (ts.isArrowFunction(prop.initializer)) {
                    const body = prop.initializer.body;
                    if (ts.isCallExpression(body) && body.arguments.length > 0) {
                      const importArg = body.arguments[0];
                      if (ts.isStringLiteral(importArg)) {
                        importPath = importArg.text;
                      }
                    }
                  }
                }
                if (prop.name.text === 'selector') {
                  hasSelector = true;
                }
              }
            }

            if (lastProp && importPath && !hasSelector) {
              const selectorInfo = pageSelectors.get(importPath);
              if (selectorInfo) {
                const lastPropEnd = lastProp.getEnd();
                // Check if there's a comma after the last property
                const afterProp = source.substring(lastPropEnd, lastPropEnd + 10);
                const hasTrailingComma = afterProp.trim().startsWith(',');

                routeObjects.push({
                  node,
                  importPath,
                  lastPropEnd: hasTrailingComma ? lastPropEnd + afterProp.indexOf(',') + 1 : lastPropEnd,
                  needsComma: !hasTrailingComma,
                });
              }
            }
          }

          ts.forEachChild(node, collectRouteObjects);
        };

        collectRouteObjects(sourceFile);

        // Sort by position descending to process from bottom to top
        routeObjects.sort((a, b) => b.lastPropEnd - a.lastPropEnd);

        // Apply injections
        modifiedSource = source;
        for (const routeObj of routeObjects) {
          const selectorInfo = pageSelectors.get(routeObj.importPath);
          if (selectorInfo) {
            const selectorHtml = `<${selectorInfo.selector}></${selectorInfo.selector}>`;
            const injection = `${routeObj.needsComma ? ',' : ''}\n    selector: '${selectorHtml}'`;

            modifiedSource = modifiedSource.substring(0, routeObj.lastPropEnd) + injection + modifiedSource.substring(routeObj.lastPropEnd);
          }
        }

        return {
          contents: modifiedSource,
          loader: 'ts',
        };
      } catch (err) {
        console.error('[Routes CTFE] Error processing routes file:', args.path, err);
        return undefined;
      }
    });
  },
};
