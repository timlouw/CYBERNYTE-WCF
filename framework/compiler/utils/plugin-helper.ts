// ============================================================================
// Plugin Helper - Common patterns for esbuild plugins
// ============================================================================

import fs from 'fs';
import ts from 'typescript';
import { sourceCache } from './cache.js';
import { logger } from './logger.js';

/**
 * Result of processing a file with AST
 */
export interface ProcessResult {
  /** Modified source code, or null if no changes */
  contents: string | null;
  /** Loader to use (default: 'ts') */
  loader?: 'ts' | 'js' | 'tsx' | 'jsx';
}

/**
 * Options for processFileWithAST
 */
export interface ProcessOptions {
  /** Plugin name for logging */
  pluginName: string;
  /** File path being processed */
  filePath: string;
  /** Quick check before parsing - return false to skip */
  shouldProcess?: (source: string) => boolean;
  /** Transform function - receives parsed source, returns modified source or null */
  transform: (source: string, sourceFile: ts.SourceFile) => string | null;
}

/**
 * Common pattern for processing files with AST in esbuild plugins.
 * Handles file reading, caching, error handling, and logging.
 *
 * @example
 * build.onLoad({ filter: /\.ts$/ }, async (args) => {
 *   return processFileWithAST({
 *     pluginName: 'my-plugin',
 *     filePath: args.path,
 *     shouldProcess: (source) => source.includes('myPattern'),
 *     transform: (source, sourceFile) => {
 *       // ... transform logic
 *       return modifiedSource;
 *     }
 *   });
 * });
 */
export const processFileWithAST = async (options: ProcessOptions): Promise<{ contents: string; loader: 'ts' } | undefined> => {
  const { pluginName, filePath, shouldProcess, transform } = options;

  try {
    // Read file
    const source = await fs.promises.readFile(filePath, 'utf8');

    // Quick check before expensive AST parsing
    if (shouldProcess && !shouldProcess(source)) {
      return undefined;
    }

    // Parse with cache
    const sourceFile = sourceCache.parse(filePath, source);

    // Transform
    const result = transform(source, sourceFile);

    if (result === null) {
      return undefined;
    }

    return {
      contents: result,
      loader: 'ts',
    };
  } catch (error) {
    logger.error(pluginName, `Error processing ${filePath}`, error);
    return undefined;
  }
};

/**
 * Skip common directories/files that shouldn't be processed
 */
export const shouldSkipPath = (filePath: string): boolean => {
  return filePath.includes('node_modules') || filePath.includes('scripts') || filePath.endsWith('.d.ts');
};

/**
 * Quick check if source contains signal usage patterns.
 * Use before expensive AST parsing.
 */
export const hasSignalPatterns = (source: string): boolean => {
  return source.includes('this.') && source.includes('()') && source.includes('signal(');
};

/**
 * Quick check if source uses html templates
 */
export const hasHtmlTemplates = (source: string): boolean => {
  return source.includes('html`');
};

/**
 * Quick check if source extends Component
 */
export const extendsComponent = (source: string): boolean => {
  return source.includes('extends Component');
};
