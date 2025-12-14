/**
 * Routes Precompiler Plugin - CTFE for Route Selectors
 *
 * Injects pre-computed page selectors into route definitions at compile time.
 * This allows the router to render pages via innerHTML without dynamic imports.
 *
 * @example
 * // Before: { path: '/', componentModule: () => import('./landing.js') }
 * // After:  { path: '/', componentModule: () => import('./landing.js'), selector: '<ui-landing></ui-landing>' }
 */
import path from 'path';
import { Plugin } from 'esbuild';
import ts from 'typescript';
import type { PageSelectorInfo, RouteObject } from '../../types.js';
import { extractPageSelector, safeReadFile, sourceCache, logger, PLUGIN_NAME, PROP, generateSelectorHTML, createLoaderResult } from '../../utils/index.js';

const NAME = PLUGIN_NAME.ROUTES;

/**
 * Resolves the page file path from the import statement in routes.
 *
 * @example
 * // '../pages/landing.js' -> 'C:/project/apps/client/pages/landing.ts'
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
 *
 * @example
 * // Input route config:
 * // { path: '/', componentModule: () => import('../pages/landing.js') }
 * //
 * // Reads landing.ts, finds: registerComponent({ selector: 'ui-landing-page' })
 * // Returns Map: { '../pages/landing.js' => { importPath: '...', selector: 'ui-landing-page' } }
 */
const extractRouteImports = async (sourceFile: ts.SourceFile, routesFilePath: string): Promise<Map<string, PageSelectorInfo>> => {
  const pageSelectors = new Map<string, PageSelectorInfo>();

  const processArrowFunction = async (node: ts.ArrowFunction) => {
    const body = node.body;
    if (ts.isCallExpression(body)) {
      const expr = body.expression;
      // Check for import() calls
      if (expr.kind === ts.SyntaxKind.ImportKeyword && body.arguments.length > 0) {
        const importArg = body.arguments[0];
        if (ts.isStringLiteral(importArg)) {
          const importPath = importArg.text;
          const pagePath = resolvePagePath(importPath, routesFilePath);

          // Read and parse the page file
          const cached = await sourceCache.get(pagePath);
          if (cached) {
            const selector = extractPageSelector(cached.sourceFile);
            if (selector) {
              pageSelectors.set(importPath, { importPath, selector });
            }
          }
        }
      }
    }
  };

  // Collect all arrow functions and process them
  const collectArrowFunctions = (node: ts.Node): ts.ArrowFunction[] => {
    const nodes: ts.ArrowFunction[] = [];
    if (ts.isArrowFunction(node)) {
      nodes.push(node);
    }
    ts.forEachChild(node, (child) => {
      nodes.push(...collectArrowFunctions(child));
    });
    return nodes;
  };

  const arrowFunctions = collectArrowFunctions(sourceFile);
  for (const fn of arrowFunctions) {
    await processArrowFunction(fn);
  }

  return pageSelectors;
};

/**
 * Routes Precompiler Plugin - CTFE for Route Selectors
 *
 * ## What it does:
 * Injects pre-computed selector HTML into route definitions at compile time.
 *
 * ## Transformation Example:
 * ```typescript
 * // INPUT (routes.ts):
 * export const routes = [
 *   { path: '/', componentModule: () => import('../pages/landing.js') }
 * ];
 *
 * // OUTPUT (after compilation):
 * export const routes = [
 *   { path: '/', componentModule: () => import('../pages/landing.js'),
 *     selector: '<ui-landing-page></ui-landing-page>' }
 * ];
 * ```
 *
 * ## How it works:
 * 1. Parse routes.ts to find all dynamic imports
 * 2. For each import, parse the corresponding page file
 * 3. Extract the selector from registerComponent({ selector: '...' })
 * 4. Inject a 'selector' property with the fully rendered HTML tag
 *
 * This allows the router to use innerHTML directly without calling module.default.
 */
export const RoutesPrecompilerPlugin: Plugin = {
  name: NAME,
  setup(build) {
    build.onLoad({ filter: /routes\.ts$/ }, async (args) => {
      try {
        // Only process the router/routes.ts file
        if (!args.path.includes('router')) {
          return undefined;
        }

        const source = await safeReadFile(args.path);
        if (!source) return undefined;

        const sourceFile = sourceCache.parse(args.path, source);

        // Extract all page selectors from dynamic imports
        const pageSelectors = await extractRouteImports(sourceFile, args.path);

        if (pageSelectors.size === 0) {
          return undefined;
        }

        logger.info(NAME, `Found ${pageSelectors.size} page selector(s) for CTFE injection`);

        // Collect route objects that need selector injection
        const routeObjects: RouteObject[] = [];

        const collectRouteObjects = (node: ts.Node): void => {
          if (ts.isObjectLiteralExpression(node)) {
            let importPath: string | null = null;
            let hasSelector = false;
            let lastProp: ts.ObjectLiteralElementLike | null = null;

            for (const prop of node.properties) {
              lastProp = prop;
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                if (prop.name.text === PROP.COMPONENT_MODULE && ts.isArrowFunction(prop.initializer)) {
                  const body = prop.initializer.body;
                  if (ts.isCallExpression(body) && body.arguments.length > 0) {
                    const importArg = body.arguments[0];
                    if (ts.isStringLiteral(importArg)) {
                      importPath = importArg.text;
                    }
                  }
                }
                if (prop.name.text === PROP.SELECTOR) {
                  hasSelector = true;
                }
              }
            }

            if (lastProp && importPath && !hasSelector) {
              const selectorInfo = pageSelectors.get(importPath);
              if (selectorInfo) {
                const lastPropEnd = lastProp.getEnd();
                const afterProp = source.substring(lastPropEnd, lastPropEnd + 10);
                const hasTrailingComma = afterProp.trim().startsWith(',');

                routeObjects.push({
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
        let modifiedSource = source;
        for (const routeObj of routeObjects) {
          const selectorInfo = pageSelectors.get(routeObj.importPath);
          if (selectorInfo) {
            const selectorHtml = generateSelectorHTML(selectorInfo.selector);
            const injection = `${routeObj.needsComma ? ',' : ''}\n    selector: '${selectorHtml}'`;

            modifiedSource = modifiedSource.substring(0, routeObj.lastPropEnd) + injection + modifiedSource.substring(routeObj.lastPropEnd);
          }
        }

        return createLoaderResult(modifiedSource);
      } catch (error) {
        logger.error(NAME, `Error processing ${args.path}`, error);
        return undefined;
      }
    });
  },
};
