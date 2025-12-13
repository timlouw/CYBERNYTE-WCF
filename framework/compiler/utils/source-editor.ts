// ============================================================================
// Source Code Editor Utilities
// ============================================================================

/**
 * A source edit operation - replace text at a position
 */
export interface SourceEdit {
  start: number;
  end: number;
  replacement: string;
}

/**
 * A code removal operation - delete text at a position
 */
export interface CodeRemoval {
  start: number;
  end: number;
  description?: string;
}

/**
 * Apply multiple source edits to a string.
 * Edits are applied in reverse order to maintain correct positions.
 *
 * @example
 * // Replace "foo" with "bar" at position 10-13
 * const result = applyEdits(source, [
 *   { start: 10, end: 13, replacement: 'bar' }
 * ]);
 *
 * @example
 * // Multiple edits are sorted and applied bottom-to-top
 * const result = applyEdits(source, [
 *   { start: 0, end: 5, replacement: 'hello' },
 *   { start: 20, end: 25, replacement: 'world' }
 * ]);
 */
export const applyEdits = (source: string, edits: SourceEdit[]): string => {
  if (edits.length === 0) return source;

  // Sort by position descending (apply from bottom to top)
  const sortedEdits = [...edits].sort((a, b) => b.start - a.start);

  let result = source;
  for (const edit of sortedEdits) {
    result = result.substring(0, edit.start) + edit.replacement + result.substring(edit.end);
  }

  return result;
};

/**
 * Remove multiple code sections from a string.
 * This is a convenience wrapper around applyEdits with empty replacements.
 *
 * @example
 * // Remove code at positions 10-20 and 50-60
 * const result = removeCode(source, [
 *   { start: 10, end: 20 },
 *   { start: 50, end: 60 }
 * ]);
 */
export const removeCode = (source: string, removals: CodeRemoval[]): string => {
  const edits: SourceEdit[] = removals.map((r) => ({
    start: r.start,
    end: r.end,
    replacement: '',
  }));
  return applyEdits(source, edits);
};

/**
 * Insert text at a specific position (non-destructive)
 */
export const insertAt = (source: string, position: number, text: string): string => {
  return source.substring(0, position) + text + source.substring(position);
};
