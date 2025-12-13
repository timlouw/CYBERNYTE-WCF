// ============================================================================
// Compiler Utilities - Barrel Export
// ============================================================================

// Colors and logging
export { consoleColors } from './colors.js';
export { logger } from './logger.js';

// File system utilities
export { safeReadFile, collectFilesRecursively, directoryExists } from './file-utils.js';

// Source code editing
export { applyEdits, removeCode, insertAt } from './source-editor.js';
export type { SourceEdit, CodeRemoval } from './source-editor.js';

// AST utilities
export {
  createSourceFile,
  isFunctionCall,
  isRegisterComponentCall,
  isSignalCall,
  getSignalGetterName,
  extractRegisterComponentConfig,
  extractComponentDefinitions,
  extractPageSelector,
  findClassExtending,
  findComponentClass,
  findEnclosingClass,
  extractStaticValue,
  findSignalInitializers,
  isHtmlTemplate,
  isCssTemplate,
  extractTemplateContent,
} from './ast-utils.js';

// Source file cache
export { sourceCache } from './cache.js';

// Plugin helpers
export { processFileWithAST, shouldSkipPath, hasSignalPatterns, hasHtmlTemplates, extendsComponent } from './plugin-helper.js';
export type { ProcessResult, ProcessOptions } from './plugin-helper.js';

// Constants
export { FN, CLASS, COMPONENT_TYPE, PROP, PLUGIN_NAME } from './constants.js';
