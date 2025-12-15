/**
 * HTML & CSS Template Minifier
 *
 * Minifies content inside template literals for HTML and CSS.
 * Based on the approach used by esbuild-minify-templates.
 *
 * For HTML:
 * - Collapses multiple whitespace to single space
 * - Removes whitespace between tags: "> <" becomes "><"
 * - Removes HTML comments
 * - Preserves whitespace in text content where meaningful
 *
 * For CSS:
 * - Collapses multiple whitespace to single space
 * - Removes CSS comments
 * - Removes whitespace around special characters: { } ; : ,
 * - Preserves necessary spaces in selectors
 */

/**
 * Minify HTML content.
 * Safe for template literals with ${expressions}.
 */
export const minifyHTML = (html: string): string => {
  return (
    html
      // Collapse all whitespace sequences (including newlines) to single space
      .replace(/\s+/g, ' ')
      // Remove space between > and <
      .replace(/>\s+</g, '><')
      // Remove leading whitespace before first tag
      .replace(/^\s+</g, '<')
      // Remove trailing whitespace after last tag
      .replace(/>\s+$/g, '>')
      // Remove HTML comments (but preserve IE conditionals if needed)
      .replace(/<!--(?!\[)[\s\S]*?-->/g, '')
      // Clean up any double spaces that might have been introduced
      .replace(/\s{2,}/g, ' ')
      // Trim the result
      .trim()
  );
};

/**
 * Minify CSS content.
 * Safe for template literals with ${expressions}.
 */
export const minifyCSS = (css: string): string => {
  return (
    css
      // Remove CSS comments (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Collapse all whitespace sequences to single space
      .replace(/\s+/g, ' ')
      // Remove space after { ; : ,
      .replace(/([{;:,])\s+/g, '$1')
      // Remove space before } ; : ,
      .replace(/\s+([};:,])/g, '$1')
      // Remove space around > + ~ selectors (but careful with content)
      .replace(/\s*([>+~])\s*/g, '$1')
      // Ensure space after selector combinators in complex selectors
      // (this is a simplification - may need refinement)
      // Remove space between ) and {
      .replace(/\)\s+\{/g, '){')
      // Remove space between : and value
      .replace(/:\s+/g, ':')
      // Clean up remaining double spaces
      .replace(/\s{2,}/g, ' ')
      // Trim
      .trim()
  );
};

/**
 * Process JavaScript source and minify all template literals.
 *
 * Finds template literals (backtick strings) and applies minification.
 * Handles both tagged templates (html`...`, css`...`) and untagged.
 *
 * This operates on the final bundled JavaScript, where:
 * - html`...` has been converted to `...`
 * - css`...` has been converted to `...`
 *
 * Uses a simple state machine to correctly handle:
 * - Nested template literals
 * - Escaped backticks
 * - ${expressions} inside templates
 */
export const minifyTemplatesInSource = (source: string): string => {
  const result: string[] = [];
  let i = 0;

  while (i < source.length) {
    // Look for template literal start
    if (source[i] === '`') {
      const templateContent = extractTemplateLiteral(source, i);

      if (templateContent !== null) {
        const { content, endIndex } = templateContent;

        // Determine if this looks like HTML or CSS based on content
        const minified = minifyTemplateContent(content);

        result.push('`' + minified + '`');
        i = endIndex + 1;
        continue;
      }
    }

    // Skip string literals to avoid false positives
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      result.push(quote);
      i++;

      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          result.push(source[i], source[i + 1]);
          i += 2;
        } else {
          result.push(source[i]);
          i++;
        }
      }

      if (i < source.length) {
        result.push(source[i]); // closing quote
        i++;
      }
      continue;
    }

    // Skip comments
    if (source[i] === '/' && i + 1 < source.length) {
      if (source[i + 1] === '/') {
        // Single-line comment
        while (i < source.length && source[i] !== '\n') {
          result.push(source[i]);
          i++;
        }
        continue;
      } else if (source[i + 1] === '*') {
        // Multi-line comment
        result.push('/*');
        i += 2;
        while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
          result.push(source[i]);
          i++;
        }
        if (i < source.length - 1) {
          result.push('*/');
          i += 2;
        }
        continue;
      }
    }

    result.push(source[i]);
    i++;
  }

  return result.join('');
};

/**
 * Extract a template literal from source starting at the given index.
 * Handles nested ${...} expressions which may contain their own template literals.
 */
const extractTemplateLiteral = (source: string, startIndex: number): { content: string; endIndex: number } | null => {
  if (source[startIndex] !== '`') return null;

  let i = startIndex + 1;
  let content = '';
  let braceDepth = 0;

  while (i < source.length) {
    // Handle escape sequences
    if (source[i] === '\\' && i + 1 < source.length) {
      content += source[i] + source[i + 1];
      i += 2;
      continue;
    }

    // Handle ${...} expressions
    if (source[i] === '$' && i + 1 < source.length && source[i + 1] === '{') {
      content += '${';
      i += 2;
      braceDepth = 1;

      // Find matching closing brace, handling nested braces and template literals
      while (i < source.length && braceDepth > 0) {
        if (source[i] === '\\' && i + 1 < source.length) {
          content += source[i] + source[i + 1];
          i += 2;
          continue;
        }

        if (source[i] === '{') {
          braceDepth++;
        } else if (source[i] === '}') {
          braceDepth--;
        } else if (source[i] === '`') {
          // Nested template literal inside expression - skip it entirely
          const nested = extractTemplateLiteral(source, i);
          if (nested) {
            content += '`' + nested.content + '`';
            i = nested.endIndex + 1;
            continue;
          }
        } else if (source[i] === '"' || source[i] === "'") {
          // Skip string literals inside expressions
          const quote = source[i];
          content += quote;
          i++;
          while (i < source.length && source[i] !== quote) {
            if (source[i] === '\\' && i + 1 < source.length) {
              content += source[i] + source[i + 1];
              i += 2;
            } else {
              content += source[i];
              i++;
            }
          }
          if (i < source.length) {
            content += source[i];
            i++;
          }
          continue;
        }

        content += source[i];
        i++;
      }
      continue;
    }

    // End of template literal
    if (source[i] === '`') {
      return { content, endIndex: i };
    }

    content += source[i];
    i++;
  }

  // Unclosed template literal - shouldn't happen in valid JS
  return null;
};

/**
 * Determine content type and apply appropriate minification.
 *
 * Heuristics:
 * - Contains < and > tags: HTML
 * - Contains { and } with : : CSS
 * - Otherwise: minimal minification (just collapse whitespace)
 */
const minifyTemplateContent = (content: string): string => {
  // Check if it looks like HTML (has tags)
  const hasHTMLTags = /<[a-zA-Z][^>]*>/.test(content) || /<\/[a-zA-Z][^>]*>/.test(content);

  // Check if it looks like CSS (has rules with properties)
  const hasCSSRules = /[{;]\s*[a-zA-Z-]+\s*:/.test(content) || /^\s*\.[a-zA-Z]/.test(content);

  if (hasHTMLTags) {
    return minifyHTML(content);
  } else if (hasCSSRules) {
    return minifyCSS(content);
  } else {
    // Generic minification - just collapse whitespace conservatively
    return content.replace(/\s+/g, ' ').trim();
  }
};
