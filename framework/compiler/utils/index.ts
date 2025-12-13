import fs from 'fs';
import ts from 'typescript';
import type { ComponentDefinition } from '../types.js';

// ============================================================================
// Console Colors
// ============================================================================

export const consoleColors = {
  green: '\x1b[32m%s\x1b[0m',
  yellow: '\x1b[33m%s\x1b[0m',
  blue: '\x1b[94m%s\x1b[0m',
  cyan: '\x1b[36m%s\x1b[0m',
  red: '\x1b[31m%s\x1b[0m',
  orange: '\x1b[38;5;208m%s\x1b[0m',
  reset: '\x1b[0m',
} as const;

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Safely read a file, returning null on error
 */
export const safeReadFile = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
};

/**
 * Recursively collect files from a directory matching a filter
 */
export const collectFilesRecursively = async (dir: string, filter: (fileName: string) => boolean): Promise<string[]> => {
  const files: string[] = [];

  const collect = async (currentDir: string): Promise<void> => {
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = `${currentDir}/${entry.name}`;
        if (entry.isDirectory()) {
          await collect(fullPath);
        } else if (entry.isFile() && filter(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip directories that don't exist or can't be read
    }
  };

  await collect(dir);
  return files;
};

// ============================================================================
// AST Utilities
// ============================================================================

/**
 * Create a TypeScript source file from source code
 */
export const createSourceFile = (filePath: string, source: string): ts.SourceFile => {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
};

/**
 * Check if a node is a registerComponent call expression
 */
export const isRegisterComponentCall = (node: ts.CallExpression): boolean => {
  const callee = node.expression;
  return ts.isIdentifier(callee) && callee.text === 'registerComponent';
};

/**
 * Extract selector and type from a registerComponent config object
 */
export const extractRegisterComponentConfig = (configArg: ts.ObjectLiteralExpression): { selector: string | null; type: string | null } => {
  let selector: string | null = null;
  let type: string | null = null;

  for (const prop of configArg.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      if (prop.name.text === 'selector' && ts.isStringLiteral(prop.initializer)) {
        selector = prop.initializer.text;
      }
      if (prop.name.text === 'type' && ts.isStringLiteral(prop.initializer)) {
        type = prop.initializer.text;
      }
    }
  }

  return { selector, type };
};

/**
 * Extract component definitions from a source file
 * Finds: export const Name = registerComponent({ selector: '...', type: 'component' })
 */
export const extractComponentDefinitions = (source: string, filePath: string): ComponentDefinition[] => {
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
 * Extract page selector from a page file
 * Finds: export default registerComponent({ selector: '...' })
 */
export const extractPageSelector = async (pagePath: string): Promise<string | null> => {
  const source = await safeReadFile(pagePath);
  if (!source) return null;

  const sourceFile = createSourceFile(pagePath, source);
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

/**
 * Find the class that extends a specific base class
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
 * Apply source edits in reverse order to maintain positions
 */
export const applySourceEdits = (source: string, edits: Array<{ start: number; end: number; replacement: string }>): string => {
  const sortedEdits = [...edits].sort((a, b) => b.start - a.start);

  let result = source;
  for (const edit of sortedEdits) {
    result = result.substring(0, edit.start) + edit.replacement + result.substring(edit.end);
  }

  return result;
};

/**
 * Apply code removals in reverse order
 */
export const applyCodeRemovals = (source: string, removals: Array<{ start: number; end: number }>): string => {
  const sortedRemovals = [...removals].sort((a, b) => b.start - a.start);

  let result = source;
  for (const removal of sortedRemovals) {
    result = result.substring(0, removal.start) + result.substring(removal.end);
  }

  return result;
};
