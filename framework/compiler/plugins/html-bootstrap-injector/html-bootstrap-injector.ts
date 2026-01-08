/**
 * HTML Bootstrap Injector Plugin
 *
 * Injects the root component's HTML into index.html at build time.
 * This provides instant content rendering (best FCP/LCP) without waiting for JS.
 *
 * ## How it works:
 * 1. Scans entry point for `mount(ComponentName, target)` call using TypeScript AST
 * 2. Traces the component import to find its definition
 * 3. Extracts the selector from the `registerComponent()` call
 * 4. Determines the mount target (document.body or getElementById)
 * 5. Injects the HTML into the appropriate location in index.html
 *
 * ## Usage:
 * In your main.ts entry point, add:
 * ```typescript
 * import { mount } from '../../framework/compiler/bootstrap.js';
 * import { AppComponent } from './pages/landing.js';
 *
 * // Option 1: Mount to body
 * mount(AppComponent, document.body);
 *
 * // Option 2: Mount to element by ID (inline)
 * mount(AppComponent, document.getElementById('root'));
 *
 * // Option 3: Mount to element by ID (variable)
 * const root = document.getElementById('root');
 * mount(AppComponent, root);
 * ```
 *
 * ## Router Compatibility:
 * This works alongside the router. The router can take over navigation
 * after the initial render. Simply include both entry points in config.ts.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { Plugin } from 'esbuild';
import { entryPoints } from '../../config.js';
import { logger, collectFilesRecursively, sourceCache, extractComponentDefinitions } from '../../utils/index.js';
import type { ComponentDefinition } from '../../types.js';

const NAME = 'html-bootstrap';

// Mount target types
type MountTarget = { type: 'body' } | { type: 'element'; id: string };

interface BootstrapConfig {
  selector: string;
  target: MountTarget;
  componentDef?: ComponentDefinition;
}

/**
 * Resolves a relative import path to an absolute file path.
 */
const resolveImportPath = (fromFile: string, importPath: string): string => {
  const fromDir = path.dirname(fromFile);
  const tsPath = importPath.replace(/\.js$/, '.ts');
  return path.resolve(fromDir, tsPath);
};

/**
 * Extracts the element ID from a document.getElementById() call expression.
 */
const extractGetElementByIdArg = (node: ts.Node): string | null => {
  if (!ts.isCallExpression(node)) return null;

  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return null;
  if (expr.name.text !== 'getElementById') return null;

  const obj = expr.expression;
  if (!ts.isIdentifier(obj) || obj.text !== 'document') return null;

  const args = node.arguments;
  if (args.length !== 1) return null;

  const arg = args[0];
  if (ts.isStringLiteral(arg)) {
    return arg.text;
  }

  return null;
};

/**
 * Parses the mount target from the second argument of mount() call.
 * Supports:
 * - document.body
 * - document.getElementById('id')
 * - variable reference to getElementById result
 */
const parseMountTarget = (targetNode: ts.Node, sourceFile: ts.SourceFile): MountTarget | null => {
  // Case 1: document.body
  if (ts.isPropertyAccessExpression(targetNode)) {
    const obj = targetNode.expression;
    if (ts.isIdentifier(obj) && obj.text === 'document' && targetNode.name.text === 'body') {
      return { type: 'body' };
    }
  }

  // Case 2: document.getElementById('id') or document.getElementById('id') as HTMLElement
  let callExpr = targetNode;
  if (ts.isAsExpression(targetNode)) {
    callExpr = targetNode.expression;
  }
  if (ts.isNonNullExpression(targetNode)) {
    callExpr = targetNode.expression;
  }

  const elementId = extractGetElementByIdArg(callExpr);
  if (elementId) {
    return { type: 'element', id: elementId };
  }

  // Case 3: Variable reference - need to trace back to its declaration
  if (ts.isIdentifier(targetNode)) {
    const varName = targetNode.text;

    // Find variable declaration in the source file
    let foundId: string | null = null;

    const findDeclaration = (node: ts.Node): void => {
      if (foundId) return;

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === varName && node.initializer) {
        // Handle: const root = document.getElementById('id')
        // Handle: const root = document.getElementById('id') as HTMLElement
        let initExpr = node.initializer;
        if (ts.isAsExpression(initExpr)) {
          initExpr = initExpr.expression;
        }
        if (ts.isNonNullExpression(initExpr)) {
          initExpr = initExpr.expression;
        }

        const id = extractGetElementByIdArg(initExpr);
        if (id) {
          foundId = id;
        }
      }

      ts.forEachChild(node, findDeclaration);
    };

    findDeclaration(sourceFile);

    if (foundId) {
      return { type: 'element', id: foundId };
    }
  }

  return null;
};

/**
 * Finds the mount() call in the source file and extracts component name and target.
 */
const findMountCall = (
  sourceFile: ts.SourceFile,
): {
  componentName: string;
  target: MountTarget;
} | null => {
  let result: { componentName: string; target: MountTarget } | null = null;

  const visit = (node: ts.Node): void => {
    if (result) return;

    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'mount' && node.arguments.length >= 2) {
        const componentArg = node.arguments[0];
        const targetArg = node.arguments[1];

        if (ts.isIdentifier(componentArg)) {
          const target = parseMountTarget(targetArg, sourceFile);
          if (target) {
            result = {
              componentName: componentArg.text,
              target,
            };
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
};

/**
 * Finds the import path for a given identifier in the source file.
 */
const findImportPath = (sourceFile: ts.SourceFile, identifierName: string): string | null => {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings) {
      const namedBindings = statement.importClause.namedBindings;
      if (ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (element.name.text === identifierName) {
            const moduleSpecifier = statement.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
              return moduleSpecifier.text;
            }
          }
        }
      }
    }
  }
  return null;
};

/**
 * Extracts the selector from a registerComponent() call using AST.
 */
const extractSelectorFromComponent = (sourceFile: ts.SourceFile): string | null => {
  let selector: string | null = null;

  const visit = (node: ts.Node): void => {
    if (selector) return;

    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'registerComponent' && node.arguments.length >= 1) {
        const configArg = node.arguments[0];
        if (ts.isObjectLiteralExpression(configArg)) {
          for (const prop of configArg.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'selector' && ts.isStringLiteral(prop.initializer)) {
              selector = prop.initializer.text;
              return;
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return selector;
};

/**
 * Finds the bootstrap configuration from the main entry point.
 * Uses TypeScript AST for reliable parsing.
 */
const findBootstrapConfig = async (entryPointPath: string): Promise<Omit<BootstrapConfig, 'componentDef'> | null> => {
  try {
    const absolutePath = path.resolve(process.cwd(), entryPointPath);
    const source = await fs.promises.readFile(absolutePath, 'utf8');

    // Parse with TypeScript
    const sourceFile = ts.createSourceFile(absolutePath, source, ts.ScriptTarget.Latest, true);

    // Find mount() call
    const mountInfo = findMountCall(sourceFile);
    if (!mountInfo) {
      return null;
    }

    // Find import path for the component
    const importPath = findImportPath(sourceFile, mountInfo.componentName);
    if (!importPath) {
      logger.warn(NAME, `Could not find import for ${mountInfo.componentName}`);
      return null;
    }

    // Resolve and read the component file
    const componentFilePath = resolveImportPath(absolutePath, importPath);
    const componentSource = await fs.promises.readFile(componentFilePath, 'utf8');
    const componentSourceFile = ts.createSourceFile(componentFilePath, componentSource, ts.ScriptTarget.Latest, true);

    // Extract selector from registerComponent()
    const selector = extractSelectorFromComponent(componentSourceFile);
    if (!selector) {
      logger.warn(NAME, `Could not find registerComponent() selector in ${componentFilePath}`);
      return null;
    }

    return {
      selector,
      target: mountInfo.target,
    };
  } catch (error) {
    logger.error(NAME, `Error finding bootstrap config: ${error}`);
    return null;
  }
};

/**
 * Collects all component definitions from the workspace.
 */
const collectComponentDefinitions = async (): Promise<Map<string, ComponentDefinition>> => {
  const componentDefinitions = new Map<string, ComponentDefinition>();
  const workspaceRoot = process.cwd();
  const searchDirs = [path.join(workspaceRoot, 'libs', 'components'), path.join(workspaceRoot, 'apps')];

  const tsFilter = (name: string) => name.endsWith('.ts') && !name.endsWith('.d.ts');

  for (const dir of searchDirs) {
    const files = await collectFilesRecursively(dir, tsFilter);

    for (const filePath of files) {
      const cached = await sourceCache.get(filePath);
      if (cached) {
        const definitions = extractComponentDefinitions(cached.sourceFile, filePath);
        for (const def of definitions) {
          componentDefinitions.set(def.selector, def);
        }
      }
    }
  }

  return componentDefinitions;
};

/**
 * Stores the bootstrap configuration for use by post-build processor.
 */
let bootstrapConfig: BootstrapConfig | null = null;

export const getBootstrapConfig = (): BootstrapConfig | null => bootstrapConfig;

/**
 * HTML Bootstrap Injector Plugin
 *
 * Determines the root component at build time and prepares the HTML injection.
 * The actual injection happens in the post-build processor.
 */
export const HTMLBootstrapInjectorPlugin: Plugin = {
  name: NAME,
  setup(build) {
    build.onStart(async () => {
      bootstrapConfig = null;

      // Find the main entry point (not router)
      const mainEntry = entryPoints.find((ep) => ep.includes('main.ts'));
      if (!mainEntry) {
        logger.info(NAME, 'No main.ts entry point found, skipping bootstrap injection');
        return;
      }

      // Find the bootstrap config using AST parsing
      const config = await findBootstrapConfig(mainEntry);
      if (!config) {
        logger.info(NAME, 'No mount() call found in main.ts');
        return;
      }

      // Collect component definitions and find the matching one
      const components = await collectComponentDefinitions();
      const componentDef = components.get(config.selector);

      bootstrapConfig = { ...config, componentDef };

      const targetDesc = config.target.type === 'body' ? 'document.body' : `#${config.target.id}`;
      logger.info(NAME, `Bootstrap component: <${config.selector}> → ${targetDesc}`);
    });
  },
};

/**
 * Injects the bootstrap HTML into the index.html content.
 * Called by the post-build processor.
 *
 * NOTE: HTML injection is disabled to prevent CLS (Cumulative Layout Shift).
 * The mount() function now dynamically creates elements at runtime, similar to Lit.
 * This provides better performance metrics (FCP/LCP scores stay the same,
 * but CLS is dramatically reduced since no pre-rendered content shifts).
 */
export const injectBootstrapHTML = (htmlContent: string): string => {
  // Disabled - let mount() handle dynamic element creation at runtime
  // This prevents the massive CLS caused by pre-rendered empty custom elements
  return htmlContent;
};
