import fs from 'fs';
import path from 'path';
import { Plugin } from 'esbuild';
import ts from 'typescript';

interface ComponentDefinition {
  name: string;
  selector: string;
  filePath: string;
}

/**
 * Extracts component definitions from source files
 * Finds patterns like: export const MyComponent = registerComponent<Props>({ selector: '...', type: '...' }, ...)
 */
const extractComponentDefinitions = (source: string, filePath: string): ComponentDefinition[] => {
  const definitions: ComponentDefinition[] = [];

  // Match: export const ComponentName = registerComponent
  const componentRegex = /export\s+const\s+(\w+)\s*=\s*registerComponent(?:<[^>]+>)?\s*\(\s*{\s*selector:\s*['"]([^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = componentRegex.exec(source)) !== null) {
    definitions.push({
      name: match[1],
      selector: match[2],
      filePath,
    });
  }

  return definitions;
};

/**
 * Generates the HTML output that registerComponent would return for a 'component' type
 * This replicates the runtime logic at compile time
 */
const generateComponentHTML = (selector: string, props: Record<string, any>): string => {
  const propsString = Object.entries(props)
    .map(([key, value]) => {
      const val = typeof value === 'string' ? value : JSON.stringify(value) || '';
      return `${key}="${val.replace(/"/g, '&quot;')}"`;
    })
    .join(' ');

  return `
      <${selector}
        ${propsString}>
      </${selector}>`;
};

/**
 * Extracts static property values from a class expression
 * Handles dependencies between properties (e.g., testValue = this.test + 'suffix')
 * Uses iterative resolution to handle property references
 */
const extractClassProperties = (classNode: ts.ClassExpression | ts.ClassDeclaration, sourceFile: ts.SourceFile): Map<string, any> => {
  const resolvedProperties = new Map<string, any>();
  const unresolvedProperties = new Map<string, ts.Expression>();

  // First pass: collect all property declarations
  for (const member of classNode.members) {
    if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name) && member.initializer) {
      // Skip signal properties
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

  // Iteratively resolve properties until no more can be resolved
  let resolved = true;
  const maxIterations = unresolvedProperties.size + 1; // Prevent infinite loops
  let iterations = 0;

  while (resolved && unresolvedProperties.size > 0 && iterations < maxIterations) {
    resolved = false;
    iterations++;

    for (const [propName, initializer] of unresolvedProperties) {
      const value = evaluateExpression(initializer, sourceFile, resolvedProperties);
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
 * Evaluates an expression to a static value
 * Supports literals, this.property references, binary expressions, template literals
 */
const evaluateExpression = (node: ts.Node, sourceFile: ts.SourceFile, classProperties: Map<string, any>): any => {
  // String literal
  if (ts.isStringLiteral(node)) {
    return node.text;
  }

  // Numeric literal
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  // Boolean literals
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  // Null literal
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  // Undefined literal
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) {
    return undefined;
  }

  // this.propertyName reference
  if (ts.isPropertyAccessExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const propName = node.name.text;
      if (classProperties.has(propName)) {
        return classProperties.get(propName);
      }
    }
    return undefined; // Can't resolve
  }

  // Binary expression (e.g., this.test + 'suffix', 1 + 2)
  if (ts.isBinaryExpression(node)) {
    const left = evaluateExpression(node.left, sourceFile, classProperties);
    const right = evaluateExpression(node.right, sourceFile, classProperties);

    if (left === undefined || right === undefined) {
      return undefined;
    }

    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        return left + right;
      case ts.SyntaxKind.MinusToken:
        return left - right;
      case ts.SyntaxKind.AsteriskToken:
        return left * right;
      case ts.SyntaxKind.SlashToken:
        return left / right;
      case ts.SyntaxKind.PercentToken:
        return left % right;
      default:
        return undefined;
    }
  }

  // Template literal (e.g., `Hello ${name}`)
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      const spanValue = evaluateExpression(span.expression, sourceFile, classProperties);
      if (spanValue === undefined) {
        return undefined;
      }
      result += String(spanValue) + span.literal.text;
    }
    return result;
  }

  // No substitution template literal (e.g., `hello`)
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  // Parenthesized expression
  if (ts.isParenthesizedExpression(node)) {
    return evaluateExpression(node.expression, sourceFile, classProperties);
  }

  // Object literal
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
        const value = evaluateExpression(prop.initializer, sourceFile, classProperties);
        if (value === undefined) {
          return undefined;
        }
        obj[key] = value;
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        // { propName } shorthand - try to resolve from class properties
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

  // Array literal
  if (ts.isArrayLiteralExpression(node)) {
    const arr = [];
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) {
        return undefined; // Can't handle spread
      }
      const value = evaluateExpression(el, sourceFile, classProperties);
      if (value === undefined) {
        return undefined;
      }
      arr.push(value);
    }
    return arr;
  }

  // Conditional expression (ternary)
  if (ts.isConditionalExpression(node)) {
    const condition = evaluateExpression(node.condition, sourceFile, classProperties);
    if (condition === undefined) {
      return undefined;
    }
    return condition ? evaluateExpression(node.whenTrue, sourceFile, classProperties) : evaluateExpression(node.whenFalse, sourceFile, classProperties);
  }

  // Prefix unary expression (e.g., -5, !true)
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evaluateExpression(node.operand, sourceFile, classProperties);
    if (operand === undefined) {
      return undefined;
    }
    switch (node.operator) {
      case ts.SyntaxKind.MinusToken:
        return -operand;
      case ts.SyntaxKind.PlusToken:
        return +operand;
      case ts.SyntaxKind.ExclamationToken:
        return !operand;
      default:
        return undefined;
    }
  }

  return undefined;
};

/**
 * Parses a static object literal from TypeScript AST
 * Only handles static values (strings, numbers, booleans, objects, arrays)
 * Also resolves this.propertyName references using the provided classProperties map
 */
const parseStaticValueWithContext = (node: ts.Node, sourceFile: ts.SourceFile, classProperties: Map<string, any>): any => {
  return evaluateExpression(node, sourceFile, classProperties);
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
 * Finds component function calls within html template literals and extracts their static props
 */
const findComponentCalls = (
  source: string,
  sourceFile: ts.SourceFile,
  knownComponents: Map<string, ComponentDefinition>,
): Array<{
  fullMatch: string;
  componentName: string;
  props: Record<string, any>;
  startIndex: number;
  endIndex: number;
}> => {
  const calls: Array<{
    fullMatch: string;
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

        // Find the enclosing class to get property values
        const enclosingClass = findEnclosingClass(node);
        const classProperties = enclosingClass ? extractClassProperties(enclosingClass, sourceFile) : new Map<string, any>();

        if (ts.isTemplateExpression(template)) {
          // Process each template span (the ${...} parts)
          template.templateSpans.forEach((span) => {
            const expr = span.expression;

            // Check if this is a component function call
            if (ts.isCallExpression(expr)) {
              const callee = expr.expression;

              if (ts.isIdentifier(callee)) {
                const componentName = callee.text;
                const componentDef = knownComponents.get(componentName);

                if (componentDef) {
                  // Try to parse the props argument with class property context
                  if (expr.arguments.length > 0) {
                    const propsArg = expr.arguments[0];
                    const props = parseStaticValueWithContext(propsArg, sourceFile, classProperties);

                    if (props !== undefined && typeof props === 'object' && props !== null) {
                      // Get the expression boundaries from the AST
                      const exprStart = expr.getStart(sourceFile);
                      const exprEnd = expr.getEnd();

                      // Look back in the source to find the ${ before the expression
                      let searchStart = exprStart - 1;
                      while (searchStart >= 0 && !/\$\{/.test(source.substring(searchStart, searchStart + 2))) {
                        searchStart--;
                      }

                      // Find the closing } after the expression
                      // The expression end gives us the position after the call expression
                      // We need to find the } that closes the template expression
                      let searchEnd = exprEnd;
                      while (searchEnd < source.length && source[searchEnd] !== '}') {
                        searchEnd++;
                      }
                      searchEnd++; // Include the closing }

                      if (searchStart >= 0 && searchEnd <= source.length) {
                        const fullMatch = source.substring(searchStart, searchEnd);

                        calls.push({
                          fullMatch,
                          componentName,
                          props,
                          startIndex: searchStart,
                          endIndex: searchEnd,
                        });
                      }
                    }
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
 * Component Precompiler Plugin
 *
 * This plugin runs BEFORE reactive-binding-compiler and:
 * 1. Collects all component definitions from the codebase
 * 2. Finds component function calls within html templates
 * 3. Evaluates those calls at compile time with static props
 * 4. Injects the resulting HTML directly into the template
 */
export const componentPrecompilerPlugin: Plugin = {
  name: 'component-precompiler-plugin',
  setup(build) {
    // Store for all known component definitions
    const componentDefinitions = new Map<string, ComponentDefinition>();

    // First pass: collect all component definitions
    build.onStart(async () => {
      componentDefinitions.clear();

      // Find all TypeScript files in libs/components and apps directories
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
    });

    // Second pass: transform files that use components
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      try {
        // Skip scripts folder and node_modules
        if (args.path.includes('scripts') || args.path.includes('node_modules')) {
          return undefined;
        }

        const source = await fs.promises.readFile(args.path, 'utf8');

        // Quick check if this file has html template
        if (!source.includes('html`')) {
          return undefined;
        }

        // Check if any known component is used in this file
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

        // Parse the source using TypeScript AST
        const sourceFile = ts.createSourceFile(args.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        // Find all component calls with static props
        const componentCalls = findComponentCalls(source, sourceFile, componentDefinitions);

        if (componentCalls.length === 0) {
          return undefined;
        }

        // Apply replacements in reverse order to maintain positions
        let modifiedSource = source;
        const sortedCalls = [...componentCalls].sort((a, b) => b.startIndex - a.startIndex);

        for (const call of sortedCalls) {
          const componentDef = componentDefinitions.get(call.componentName);
          if (componentDef) {
            // Generate the compiled HTML
            const compiledHTML = generateComponentHTML(componentDef.selector, call.props);

            // Replace the ${ComponentName(...)} with the compiled HTML
            modifiedSource = modifiedSource.substring(0, call.startIndex) + compiledHTML + modifiedSource.substring(call.endIndex);
          }
        }

        // Also handle css and html template literals since this onLoad will prevent
        // reactive-binding-compiler from processing this file
        // Replace css` and html` with just ` (template literal)
        modifiedSource = modifiedSource.replace(/css`/g, '`');
        modifiedSource = modifiedSource.replace(/html`/g, '`');

        return {
          contents: modifiedSource,
          loader: 'ts',
        };
      } catch (err) {
        console.error('Error in component-precompiler for file:', args.path, err);
        return undefined;
      }
    });
  },
};
