// ============================================================================
// Source File Cache - Avoid re-parsing files across plugins
// ============================================================================

import ts from 'typescript';
import { safeReadFile } from './file-utils.js';

interface CachedFile {
  source: string;
  sourceFile: ts.SourceFile;
  timestamp: number;
}

/**
 * Caches parsed TypeScript source files to avoid re-parsing
 * the same file multiple times across different plugins.
 *
 * @example
 * // Get parsed source file (cached after first read)
 * const { source, sourceFile } = await sourceCache.get('./src/component.ts');
 *
 * // Clear cache between builds
 * sourceCache.clear();
 */
class SourceFileCache {
  private cache = new Map<string, CachedFile>();

  /**
   * Get or parse a source file.
   * Returns cached version if available.
   */
  async get(filePath: string): Promise<{ source: string; sourceFile: ts.SourceFile } | null> {
    // Check cache first
    const cached = this.cache.get(filePath);
    if (cached) {
      return { source: cached.source, sourceFile: cached.sourceFile };
    }

    // Read and parse file
    const source = await safeReadFile(filePath);
    if (!source) return null;

    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    // Cache it
    this.cache.set(filePath, {
      source,
      sourceFile,
      timestamp: Date.now(),
    });

    return { source, sourceFile };
  }

  /**
   * Parse source code directly (for modified content)
   */
  parse(filePath: string, source: string): ts.SourceFile {
    return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  }

  /**
   * Clear the entire cache (call between builds)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove a specific file from cache
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; files: string[] } {
    return {
      size: this.cache.size,
      files: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
export const sourceCache = new SourceFileCache();
