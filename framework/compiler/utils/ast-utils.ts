// ============================================================================
// TypeScript AST Utilities
// ============================================================================

import ts from 'typescript';
import type { ComponentDefinition } from '../types.js';
import { FN, PROP, COMPONENT_TYPE, CLASS } from './constants.js';

// ============================================================================
// Basic AST Helpers
// ============================================================================

/**
 * Create a TypeScript source file from source code.
 * Prefer using sourceCache.get() for automatic caching.
 */
export const createSourceFile = (filePath: string, source: string): ts.SourceFile => {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
};

/**
 * Check if a node is a specific function call by name
 */
export const isFunctionCall = (node: ts.CallExpression, functionName: string): boolean => {
  return ts.isIdentifier(node.expression) && node.expression.text === functionName;
};

/**
 * Check if a node is a registerComponent call expression
 */
export const isRegisterComponentCall = (node: ts.CallExpression): boolean => {
  return isFunctionCall(node, FN.REGISTER_COMPONENT);
};

/**
 * Check if a node is a signal() call expression
 */
export const isSignalCall = (node: ts.CallExpression): boolean => {
  return isFunctionCall(node, FN.SIGNAL);
};

/**
 * Check if a call expression is a signal getter: this.signalName()
 * Returns the signal name if it is, null otherwise.
 */
export const getSignalGetterName = (node: ts.CallExpression): string | null => {
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    ts.isIdentifier(node.expression.name) &&
    node.arguments.length === 0
  ) {
    return node.expression.name.text;
  }
  return null;
};

// ============================================================================
// Config Extraction
// ============================================================================

/**
 * Extract selector and type from a registerComponent config object.
 *
 * @example
 * // Given: registerComponent({ selector: 'my-component', type: 'component' })
 * // Returns: { selector: 'my-component', type: 'component' }
 */
export const extractRegisterComponentConfig = (configArg: ts.ObjectLiteralExpression): { selector: string | null; type: string | null } => {
  let selector: string | null = null;
  let type: string | null = null;

  for (const prop of configArg.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      if (prop.name.text === PROP.SELECTOR && ts.isStringLiteral(prop.initializer)) {
        selector = prop.initializer.text;
      }
      if (prop.name.text === PROP.TYPE && ts.isStringLiteral(prop.initializer)) {
        type = prop.initializer.text;
      }
    }
  }

  return { selector, type };
};

// ============================================================================
// Component Definition Extraction
// ============================================================================

/**
 * Extract component definitions from a source file.
 * Finds: export const Name = registerComponent({ selector: '...', type: 'component' })
 *
 * @example
 * // Input source:
 * // export const MyButton = registerComponent({
 * //   selector: 'my-button',
 * //   type: 'component',
 * //   ...
 * // });
 * //
 * // Output:
 * // [{ name: 'MyButton', selector: 'my-button', filePath: '...' }]
 */
export const extractComponentDefinitions = (sourceFile: ts.SourceFile, filePath: string): ComponentDefinition[] => {
  const definitions: ComponentDefinition[] = [];

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
              if (selector && type === COMPONENT_TYPE.COMPONENT) {
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
 * Extract page selector from a page file.
 * Finds: export default registerComponent({ selector: '...' })
 */
export const extractPageSelector = (sourceFile: ts.SourceFile): string | null => {
  let selector: string | null = null;

  const visit = (node: ts.Node) => {
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const expr = node.expression;
      if (ts.isCallExpression(expr) && isRegisterComponentCall(expr)) {
        const configArg = expr.arguments[0];
        if (configArg && ts.isObjectLiteralExpression(configArg)) {
          const config = extractRegisterComponentConfig(configArg);
          selector = config.selector;
        }
      }
    }

    if (!selector) {
      ts.forEachChild(node, visit);
    }
  };

  visit(sourceFile);
  return selector;
};

// ============================================================================
// Class Finding Utilities
// ============================================================================

/**
 * Find the class that extends a specific base class.
 *
 * @example
 * // Find: class MyComponent extends Component { ... }
 * const componentClass = findClassExtending(sourceFile, 'Component');
 */
export const findClassExtending = (sourceFile: ts.SourceFile, baseClassName: string): ts.ClassExpression | ts.ClassDeclaration | null => {
  let foundClass: ts.ClassExpression | ts.ClassDeclaration | null = null;

  const visit = (node: ts.Node) => {
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            if (ts.isIdentifier(type.expression) && type.expression.text === baseClassName) {
              foundClass = node;
            }
          }
        }
      }
    }
    if (!foundClass) {
      ts.forEachChild(node, visit);
    }
  };

  visit(sourceFile);
  return foundClass;
};

/**
 * Find the Component class in a source file
 */
export const findComponentClass = (sourceFile: ts.SourceFile): ts.ClassExpression | ts.ClassDeclaration | null => {
  return findClassExtending(sourceFile, CLASS.COMPONENT);
};

/**
 * Find the enclosing class for a given node
 */
export const findEnclosingClass = (node: ts.Node): ts.ClassExpression | ts.ClassDeclaration | null => {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isClassExpression(current) || ts.isClassDeclaration(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

// ============================================================================
// Signal Detection
// ============================================================================

/**
 * Extract static value from an expression if possible.
 * Used for signal initializers and CTFE.
 */
export const extractStaticValue = (arg: ts.Expression): string | number | boolean | null => {
  if (ts.isStringLiteral(arg)) return arg.text;
  if (ts.isNumericLiteral(arg)) return Number(arg.text);
  if (arg.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (arg.kind === ts.SyntaxKind.FalseKeyword) return false;

  // Simple string concatenation: "a" + "b"
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = extractStaticValue(arg.left);
    const right = extractStaticValue(arg.right);
    if (typeof left === 'string' && typeof right === 'string') {
      return left + right;
    }
  }
  return null;
};

/**
 * Find all signal property declarations and their initial values.
 *
 * @example
 * // Input class:
 * // class MyComponent extends Component {
 * //   count = signal(0);
 * //   name = signal('hello');
 * // }
 * //
 * // Output Map:
 * // { 'count' => 0, 'name' => 'hello' }
 */
export const findSignalInitializers = (sourceFile: ts.SourceFile): Map<string, string | number | boolean> => {
  const initializers = new Map<string, string | number | boolean>();

  const visit = (node: ts.Node) => {
    if (ts.isPropertyDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && isSignalCall(node.initializer)) {
      const args = node.initializer.arguments;
      if (args.length > 0) {
        const value = extractStaticValue(args[0]);
        if (value !== null) {
          initializers.set(node.name.text, value);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializers;
};

// ============================================================================
// Template Utilities
// ============================================================================

/**
 * Check if a node is an html tagged template: html`...`
 */
export const isHtmlTemplate = (node: ts.TaggedTemplateExpression): boolean => {
  return ts.isIdentifier(node.tag) && node.tag.text === FN.HTML;
};

/**
 * Check if a node is a css tagged template: css`...`
 */
export const isCssTemplate = (node: ts.TaggedTemplateExpression): boolean => {
  return ts.isIdentifier(node.tag) && node.tag.text === FN.CSS;
};

/**
 * Extract template content from a tagged template expression.
 * Handles both simple templates and templates with expressions.
 *
 * @example
 * // html`<div>Hello</div>` => '<div>Hello</div>'
 * // html`<div>${name}</div>` => '<div>${name}</div>'
 */
export const extractTemplateContent = (template: ts.TemplateLiteral, sourceFile: ts.SourceFile): string => {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return template.text;
  }

  if (ts.isTemplateExpression(template)) {
    let content = template.head.text;
    for (const span of template.templateSpans) {
      content += '${' + span.expression.getText(sourceFile) + '}';
      content += span.literal.text;
    }
    return content;
  }

  return '';
};
