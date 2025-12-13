// ============================================================================
// Shared Compiler Types
// ============================================================================

/**
 * Supported applications in the monorepo
 */
export type Application = 'client' | 'admin';

/**
 * Build environment
 */
export type Environment = 'dev' | 'prod';

/**
 * Component definition extracted from source files
 */
export interface ComponentDefinition {
  name: string;
  selector: string;
  filePath: string;
}

/**
 * Page selector info for route compilation
 */
export interface PageSelectorInfo {
  importPath: string;
  selector: string;
}

/**
 * Reactive binding configuration
 */
export interface ReactiveBinding {
  signalName: string;
  elementSelector: string;
  propertyType: 'style' | 'attribute' | 'innerText';
  property?: string;
}

/**
 * Signal expression found in templates
 */
export interface SignalExpression {
  signalName: string;
  fullExpression: string;
  start: number;
  end: number;
}

/**
 * Template edit operation
 */
export interface TemplateEdit {
  type: 'remove' | 'replace' | 'insertId';
  start: number;
  end: number;
  content?: string;
  elementId?: string;
}

/**
 * Import information for AST manipulation
 */
export interface ImportInfo {
  namedImports: string[];
  moduleSpecifier: string;
  start: number;
  end: number;
  quoteChar: string;
}

/**
 * Code removal operation
 */
export interface CodeRemoval {
  start: number;
  end: number;
  description: string;
}

/**
 * Source edit operation
 */
export interface SourceEdit {
  start: number;
  end: number;
  replacement: string;
}
