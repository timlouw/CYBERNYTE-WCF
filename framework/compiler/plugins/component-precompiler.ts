import fs from 'fs';
import path from 'path';
import { Plugin } from 'esbuild';
import ts from 'typescript';
import vm from 'vm';
import { generateComponentHTML } from '../../runtime/dom/component-html.js';
import type { ComponentDefinition } from '../types.js';
import { createSourceFile, extractRegisterComponentConfig, isRegisterComponentCall } from '../utils/index.js';

/**
 * Extracts component definitions from source files using TypeScript AST.
 * More robust than regex - handles formatting variations and comments.
 */
const extractComponentDefinitions = (source: string, filePath: string): ComponentDefinition[] => {
  const definitions: ComponentDefinition[] = [];
  const sourceFile = createSourceFile(filePath, source);

  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      const hasExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (hasExport) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer && ts.isCallExpression(decl.initializer) && isRegisterComponentCall(decl.initializer)) {
            const configArg = decl.initializer.arguments[0];
            if (configArg && ts.isObjectLiteralExpression(configArg)) {
              const { selector, type } = extractRegisterComponentConfig(configArg);

              // Only register 'component' type (not 'page')
              if (selector && type === 'component') {
                definitions.push({
                  name: decl.name.text,
                  selector,
                  filePath,
                });
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return definitions;
};

/**
 * Creates a compile-time evaluation context for static expressions.
 * Uses Node.js vm module to actually execute code at compile time.
 * This is TRUE CTFE - we're running JavaScript code during compilation!
 */
const createCTFEContext = (classProperties: Map<string, any>) => {
  const sandbox: Record<string, any> = {
    // Provide safe built-ins for expression evaluation
    JSON,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  };

  // Add class properties to context
  for (const [key, value] of classProperties) {
    sandbox[key] = value;
  }

  return vm.createContext(sandbox);
};

/**
 * Evaluates an expression at compile time using TypeScript AST.
 * For complex expressions, uses Node.js vm module for actual execution.
 *
 * This is TRUE CTFE: we actually execute JavaScript at compile time!
 */
const evaluateExpressionCTFE = (node: ts.Node, sourceFile: ts.SourceFile, classProperties: Map<string, any>): any => {
  // For simple literals, direct extraction is faster than vm
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return undefined;

  // For this.property references - resolve from class properties
  if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const propName = node.name.text;
    if (classProperties.has(propName)) {
      return classProperties.get(propName);
    }
    return undefined;
  }

  // For object literals - build directly from AST for accuracy
  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, any> = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && prop.name) {
        let key: string;
        if (ts.isIdentifier(prop.name)) {
          key = prop.name.text;
        } else if (ts.isStringLiteral(prop.name)) {
          key = prop.name.text;
        } else if (ts.isNumericLiteral(prop.name)) {
          key = prop.name.text;
        } else {
          continue;
        }
        const value = evaluateExpressionCTFE(prop.initializer, sourceFile, classProperties);
        if (value === undefined && prop.initializer.kind !== ts.SyntaxKind.UndefinedKeyword) {
          // Couldn't evaluate - skip CTFE for this call
          return undefined;
        }
        obj[key] = value;
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        const key = prop.name.text;
        if (classProperties.has(key)) {
          obj[key] = classProperties.get(key);
        } else {
          return undefined;
        }
      }
    }
    return obj;
  }

  // For arrays
  if (ts.isArrayLiteralExpression(node)) {
    const arr = [];
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) {
        return undefined; // Can't CTFE spread
      }
      const value = evaluateExpressionCTFE(el, sourceFile, classProperties);
      if (value === undefined && el.kind !== ts.SyntaxKind.UndefinedKeyword) {
        return undefined;
      }
      arr.push(value);
    }
    return arr;
  }

  // For more complex expressions, use vm to ACTUALLY EXECUTE at compile time
  // This is the essence of TRUE CTFE!
  try {
    const context = createCTFEContext(classProperties);
    // Transform 'this.prop' to just 'prop' for vm execution
    let code = node.getText(sourceFile);
    code = code.replace(/this\./g, '');

    // Execute the expression at compile time
    const result = vm.runInContext(`(${code})`, context, {
      timeout: 1000, // Safety: prevent infinite loops
    });
    return result;
  } catch {
    // If we can't evaluate at compile time, skip CTFE for this call
    return undefined;
  }
};

/**
 * Extracts static class properties that can be evaluated at compile time.
 */
const extractClassPropertiesCTFE = (classNode: ts.ClassExpression | ts.ClassDeclaration, sourceFile: ts.SourceFile): Map<string, any> => {
  const resolvedProperties = new Map<string, any>();
  const unresolvedProperties = new Map<string, ts.Expression>();

  // First pass: collect all property declarations (skip signals - they're reactive)
  for (const member of classNode.members) {
    if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name) && member.initializer) {
      // Skip signal properties - they're reactive and can't be CTFE'd
      if (ts.isCallExpression(member.initializer)) {
        const callee = member.initializer.expression;
        if (ts.isIdentifier(callee) && callee.text === 'signal') {
          continue;
        }
      }

      const propName = member.name.text;
      unresolvedProperties.set(propName, member.initializer);
    }
  }

  // Iteratively resolve properties (handles dependencies like: b = this.a + 1)
  let resolved = true;
  const maxIterations = unresolvedProperties.size + 1;
  let iterations = 0;

  while (resolved && unresolvedProperties.size > 0 && iterations < maxIterations) {
    resolved = false;
    iterations++;

    for (const [propName, initializer] of unresolvedProperties) {
      const value = evaluateExpressionCTFE(initializer, sourceFile, resolvedProperties);
      if (value !== undefined) {
        resolvedProperties.set(propName, value);
        unresolvedProperties.delete(propName);
        resolved = true;
      }
    }
  }

  return resolvedProperties;
};

/**
 * Finds the enclosing class for a given node
 */
const findEnclosingClass = (node: ts.Node): ts.ClassExpression | ts.ClassDeclaration | null => {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isClassExpression(current) || ts.isClassDeclaration(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

/**
 * Finds component function calls within html template literals.
 * Uses AST-based analysis for accuracy instead of fragile regex.
 */
const findComponentCallsCTFE = (
  source: string,
  sourceFile: ts.SourceFile,
  knownComponents: Map<string, ComponentDefinition>,
): Array<{
  componentName: string;
  props: Record<string, any>;
  startIndex: number;
  endIndex: number;
}> => {
  const calls: Array<{
    componentName: string;
    props: Record<string, any>;
    startIndex: number;
    endIndex: number;
  }> = [];

  const visit = (node: ts.Node) => {
    // Find html tagged template expressions
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag;
      if (ts.isIdentifier(tag) && tag.text === 'html') {
        const template = node.template;

        // Get class context for property resolution
        const enclosingClass = findEnclosingClass(node);
        const classProperties = enclosingClass ? extractClassPropertiesCTFE(enclosingClass, sourceFile) : new Map<string, any>();

        if (ts.isTemplateExpression(template)) {
          template.templateSpans.forEach((span) => {
            const expr = span.expression;

            if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
              const componentName = expr.expression.text;
              const componentDef = knownComponents.get(componentName);

              if (componentDef && expr.arguments.length > 0) {
                const propsArg = expr.arguments[0];

                // CTFE: Evaluate the props at compile time
                const props = evaluateExpressionCTFE(propsArg, sourceFile, classProperties);

                if (props !== undefined && typeof props === 'object' && props !== null) {
                  // Find the ${ ... } boundaries in the source
                  const exprStart = expr.getStart(sourceFile);
                  const exprEnd = expr.getEnd();

                  let searchStart = exprStart - 1;
                  while (searchStart >= 0 && source.substring(searchStart, searchStart + 2) !== '${') {
                    searchStart--;
                  }

                  let searchEnd = exprEnd;
                  while (searchEnd < source.length && source[searchEnd] !== '}') {
                    searchEnd++;
                  }
                  searchEnd++;

                  if (searchStart >= 0 && searchEnd <= source.length) {
                    calls.push({
                      componentName,
                      props,
                      startIndex: searchStart,
                      endIndex: searchEnd,
                    });
                  }
                }
              }
            }
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return calls;
};

/**
 * Component Precompiler Plugin - TRUE CTFE Implementation
 *
 * This plugin implements Compile-Time Function Evaluation (CTFE) by:
 *
 * 1. Using TypeScript AST for accurate parsing (no fragile regex)
 * 2. Using Node.js vm module to ACTUALLY EXECUTE expressions at compile time
 * 3. Calling the same generateComponentHTML function that runs at runtime
 *
 * What makes this TRUE CTFE:
 * - The vm module actually executes JavaScript during compilation
 * - Props are evaluated by running the actual expression code
 * - The HTML generation uses the same logic as runtime
 * - No manual reimplementation of expression evaluation
 *
 * Comparison to fake CTFE:
 * - Fake: Manually handle each expression type (string concat, arithmetic, etc.)
 * - True: Use vm.runInContext() to execute the actual expression
 *
 * - Fake: Duplicate the generateComponentHTML logic
 * - True: Use the same function (or identical implementation verified by tests)
 */
export const ComponentPrecompilerPlugin: Plugin = {
  name: 'component-precompiler-plugin',
  setup(build) {
    const componentDefinitions = new Map<string, ComponentDefinition>();

    // Load the CTFE function - this is THE SAME function used at runtime
    const generateHTML = generateComponentHTML;

    // First pass: collect all component definitions using AST
    build.onStart(async () => {
      componentDefinitions.clear();

      const workspaceRoot = process.cwd();
      const searchDirs = [path.join(workspaceRoot, 'libs', 'components'), path.join(workspaceRoot, 'apps')];

      const collectFromDir = async (dir: string) => {
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await collectFromDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
              try {
                const source = await fs.promises.readFile(fullPath, 'utf8');
                const definitions = extractComponentDefinitions(source, fullPath);
                for (const def of definitions) {
                  componentDefinitions.set(def.name, def);
                }
              } catch {
                // Skip files that can't be read
              }
            }
          }
        } catch {
          // Skip directories that don't exist
        }
      };

      for (const dir of searchDirs) {
        await collectFromDir(dir);
      }

      if (componentDefinitions.size > 0) {
        console.log(`[CTFE] Found ${componentDefinitions.size} component(s) for compile-time evaluation`);
      }
    });

    // Second pass: transform files using TRUE CTFE
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      try {
        if (args.path.includes('scripts') || args.path.includes('node_modules')) {
          return undefined;
        }

        const source = await fs.promises.readFile(args.path, 'utf8');

        if (!source.includes('html`')) {
          return undefined;
        }

        // Quick check for component usage
        let hasComponentCalls = false;
        for (const [componentName] of componentDefinitions) {
          if (source.includes(componentName + '(')) {
            hasComponentCalls = true;
            break;
          }
        }

        if (!hasComponentCalls) {
          return undefined;
        }

        const sourceFile = ts.createSourceFile(args.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const componentCalls = findComponentCallsCTFE(source, sourceFile, componentDefinitions);

        if (componentCalls.length === 0) {
          return undefined;
        }

        // Apply CTFE: actually execute generateHTML at compile time!
        let modifiedSource = source;
        const sortedCalls = [...componentCalls].sort((a, b) => b.startIndex - a.startIndex);

        for (const call of sortedCalls) {
          const componentDef = componentDefinitions.get(call.componentName);
          if (componentDef) {
            // TRUE CTFE: Execute the actual function at compile time!
            const compiledHTML = generateHTML({
              selector: componentDef.selector,
              props: call.props,
            });

            modifiedSource = modifiedSource.substring(0, call.startIndex) + compiledHTML + modifiedSource.substring(call.endIndex);
          }
        }

        // Strip template tags (html` and css` become just template literals)
        modifiedSource = modifiedSource.replace(/css`/g, '`');
        modifiedSource = modifiedSource.replace(/html`/g, '`');

        return {
          contents: modifiedSource,
          loader: 'ts',
        };
      } catch (err) {
        console.error('[CTFE] Error processing file:', args.path, err);
        return undefined;
      }
    });
  },
};
