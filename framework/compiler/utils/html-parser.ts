/**
 * State Machine HTML Parser
 *
 * A robust HTML parser that walks through HTML character by character,
 * tracking state transitions to properly handle nested elements, attributes
 * with expressions, and edge cases that regex-based parsing can't handle.
 */

// ============================================================================
// Types
// ============================================================================

type ParserState =
  | 'TEXT' // Outside any tag
  | 'TAG_OPEN' // Just saw '<'
  | 'TAG_NAME' // Reading tag name
  | 'TAG_SPACE' // In tag, after name or attribute
  | 'ATTR_NAME' // Reading attribute name
  | 'ATTR_EQ' // Just saw '='
  | 'ATTR_VALUE_Q' // Inside quoted attribute value
  | 'ATTR_VALUE_UQ' // Unquoted attribute value
  | 'TAG_CLOSE' // Just saw '</'
  | 'SELF_CLOSE' // Just saw '/' expecting '>'
  | 'COMMENT'; // Inside <!-- -->

export interface AttributeInfo {
  name: string;
  value: string;
  start: number; // Start position of attribute name
  end: number; // End position after closing quote
  valueStart: number; // Start of value (after opening quote)
  valueEnd: number; // End of value (before closing quote)
}

export interface HtmlElement {
  tagName: string;
  tagStart: number; // Position of '<'
  tagNameEnd: number; // Position after tag name
  openTagEnd: number; // Position after '>'
  closeTagStart: number; // Position of '</' (or same as openTagEnd for self-closing)
  closeTagEnd: number; // Position after closing '>'
  attributes: Map<string, AttributeInfo>;
  children: HtmlElement[];
  parent: HtmlElement | null;
  isSelfClosing: boolean;
  isVoid: boolean;
  textContent: TextNode[]; // Text nodes directly inside this element
  whenDirective?: string; // The "${when(...)}" directive if present
  whenDirectiveStart?: number; // Start position of the when directive
  whenDirectiveEnd?: number; // End position of the when directive
}

export interface TextNode {
  content: string;
  start: number;
  end: number;
}

export interface BindingInfo {
  element: HtmlElement;
  type: 'text' | 'style' | 'attr' | 'when';
  signalName: string;
  signalNames?: string[]; // For complex when expressions with multiple signals
  property?: string; // For style/attr bindings
  expressionStart: number; // Position of ${
  expressionEnd: number; // Position after }
  fullExpression: string; // The full ${this.signal()} string
  /** For 'when' bindings: the inner JS expression (without ${...} and when()) */
  jsExpression?: string;
}

export interface ParsedTemplate {
  roots: HtmlElement[];
  bindings: BindingInfo[];
  html: string; // Original HTML string
}

// Void elements that don't have closing tags
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// ============================================================================
// Parser Implementation
// ============================================================================

export function parseHtmlTemplate(html: string): ParsedTemplate {
  const roots: HtmlElement[] = [];
  const bindings: BindingInfo[] = [];

  let state: ParserState = 'TEXT';
  let pos = 0;

  // Current element being built
  let currentElement: HtmlElement | null = null;
  let elementStack: HtmlElement[] = [];

  // Temporary buffers
  let tagName = '';
  let tagStart = 0;
  let attrName = '';
  let attrValue = '';
  let attrStart = 0;
  let attrValueStart = 0;
  let quoteChar = '';

  // Text accumulation
  let textStart = 0;
  let textContent = '';

  // Comment tracking
  let commentBuffer = '';

  const flushText = () => {
    if (textContent.trim()) {
      const parent = elementStack[elementStack.length - 1];
      if (parent) {
        parent.textContent.push({
          content: textContent,
          start: textStart,
          end: pos,
        });
      }
      // Check for bindings in text
      findBindingsInText(textContent, textStart, parent, bindings);
    }
    textContent = '';
  };

  const pushElement = (element: HtmlElement) => {
    const parent = elementStack[elementStack.length - 1];
    if (parent) {
      parent.children.push(element);
      element.parent = parent;
    } else {
      roots.push(element);
    }
    if (!element.isSelfClosing && !element.isVoid) {
      elementStack.push(element);
    }
  };

  const closeElement = (closingTagName: string, closeStart: number, closeEnd: number) => {
    // Find matching element in stack (handles malformed HTML)
    for (let i = elementStack.length - 1; i >= 0; i--) {
      if (elementStack[i].tagName.toLowerCase() === closingTagName.toLowerCase()) {
        const element = elementStack[i];
        element.closeTagStart = closeStart;
        element.closeTagEnd = closeEnd;
        // Pop everything from this element up (handles unclosed tags)
        elementStack.length = i;
        return;
      }
    }
    // No matching open tag - ignore orphan closing tag
  };

  while (pos < html.length) {
    const char = html[pos];
    const nextChar = html[pos + 1];

    switch (state) {
      case 'TEXT':
        if (char === '<') {
          flushText();
          if (nextChar === '!') {
            if (html.substring(pos, pos + 4) === '<!--') {
              state = 'COMMENT';
              commentBuffer = '';
              pos += 4;
              continue;
            }
          }
          tagStart = pos;
          state = 'TAG_OPEN';
        } else {
          if (textContent === '') {
            textStart = pos;
          }
          textContent += char;
        }
        break;

      case 'TAG_OPEN':
        if (char === '/') {
          state = 'TAG_CLOSE';
          tagName = '';
        } else if (/[a-zA-Z]/.test(char)) {
          state = 'TAG_NAME';
          tagName = char;
        } else {
          // Not a valid tag, treat as text
          state = 'TEXT';
          textContent += '<' + char;
        }
        break;

      case 'TAG_NAME':
        if (/[\w\-:]/.test(char)) {
          tagName += char;
        } else if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
          state = 'TAG_SPACE';
          currentElement = createEmptyElement(tagName, tagStart, pos);
        } else if (char === '>') {
          currentElement = createEmptyElement(tagName, tagStart, pos);
          currentElement.openTagEnd = pos + 1;
          if (currentElement.isVoid) {
            currentElement.closeTagStart = pos + 1;
            currentElement.closeTagEnd = pos + 1;
          }
          pushElement(currentElement);
          findBindingsInAttributes(currentElement, bindings);
          currentElement = null;
          state = 'TEXT';
          textContent = '';
          textStart = pos + 1;
        } else if (char === '/' && nextChar === '>') {
          currentElement = createEmptyElement(tagName, tagStart, pos);
          currentElement.isSelfClosing = true;
          currentElement.openTagEnd = pos + 2;
          currentElement.closeTagStart = pos + 2;
          currentElement.closeTagEnd = pos + 2;
          pushElement(currentElement);
          findBindingsInAttributes(currentElement, bindings);
          currentElement = null;
          state = 'TEXT';
          pos++; // Skip the '>'
          textContent = '';
          textStart = pos + 1;
        }
        break;

      case 'TAG_SPACE':
        if (char === '>') {
          currentElement!.openTagEnd = pos + 1;
          if (currentElement!.isVoid) {
            currentElement!.closeTagStart = pos + 1;
            currentElement!.closeTagEnd = pos + 1;
          }
          pushElement(currentElement!);
          findBindingsInAttributes(currentElement!, bindings);
          currentElement = null;
          state = 'TEXT';
          textContent = '';
          textStart = pos + 1;
        } else if (char === '/' && nextChar === '>') {
          currentElement!.isSelfClosing = true;
          currentElement!.openTagEnd = pos + 2;
          currentElement!.closeTagStart = pos + 2;
          currentElement!.closeTagEnd = pos + 2;
          pushElement(currentElement!);
          findBindingsInAttributes(currentElement!, bindings);
          currentElement = null;
          state = 'TEXT';
          pos++; // Skip the '>'
          textContent = '';
          textStart = pos + 1;
        } else if (char === '"' && html.substring(pos, pos + 8) === '"${when(') {
          // Handle "${when(...)}" directive - find the closing "}" and "
          const directiveStart = pos;
          let braceDepth = 0;
          let parenDepth = 0;
          let i = pos + 2; // Skip past "$
          while (i < html.length) {
            if (html[i] === '{') braceDepth++;
            else if (html[i] === '}') {
              braceDepth--;
              if (braceDepth === 0 && html[i + 1] === '"') {
                // Found the end of the directive
                const directiveEnd = i + 2; // Include closing "
                const directive = html.substring(directiveStart, directiveEnd);
                currentElement!.whenDirective = directive;
                currentElement!.whenDirectiveStart = directiveStart;
                currentElement!.whenDirectiveEnd = directiveEnd;
                pos = directiveEnd - 1; // -1 because loop will increment
                break;
              }
            } else if (html[i] === '(') parenDepth++;
            else if (html[i] === ')') parenDepth--;
            i++;
          }
          state = 'TAG_SPACE';
        } else if (/[a-zA-Z_:@]/.test(char)) {
          state = 'ATTR_NAME';
          attrName = char;
          attrStart = pos;
        }
        // Skip whitespace
        break;

      case 'ATTR_NAME':
        if (/[\w\-:@.]/.test(char)) {
          attrName += char;
        } else if (char === '=') {
          state = 'ATTR_EQ';
        } else if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
          // Could be space before '=' or a boolean attribute
          // Look ahead to see if '=' follows
          let lookAhead = pos + 1;
          while (lookAhead < html.length && /\s/.test(html[lookAhead])) {
            lookAhead++;
          }
          if (lookAhead < html.length && html[lookAhead] === '=') {
            // Space before '=', skip to '='
            pos = lookAhead - 1; // Will be incremented at end of loop
            state = 'ATTR_NAME'; // Stay in ATTR_NAME to process the '=' next iteration
          } else {
            // Boolean attribute (no value)
            currentElement!.attributes.set(attrName, {
              name: attrName,
              value: '',
              start: attrStart,
              end: pos,
              valueStart: pos,
              valueEnd: pos,
            });
            state = 'TAG_SPACE';
          }
        } else if (char === '>') {
          // Boolean attribute at end of tag
          currentElement!.attributes.set(attrName, {
            name: attrName,
            value: '',
            start: attrStart,
            end: pos,
            valueStart: pos,
            valueEnd: pos,
          });
          currentElement!.openTagEnd = pos + 1;
          if (currentElement!.isVoid) {
            currentElement!.closeTagStart = pos + 1;
            currentElement!.closeTagEnd = pos + 1;
          }
          pushElement(currentElement!);
          findBindingsInAttributes(currentElement!, bindings);
          currentElement = null;
          state = 'TEXT';
          textContent = '';
          textStart = pos + 1;
        }
        break;

      case 'ATTR_EQ':
        if (char === '"' || char === "'") {
          quoteChar = char;
          attrValue = '';
          attrValueStart = pos + 1;
          state = 'ATTR_VALUE_Q';
        } else if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
          // Unquoted attribute value
          attrValue = char;
          attrValueStart = pos;
          state = 'ATTR_VALUE_UQ';
        }
        break;

      case 'ATTR_VALUE_Q':
        if (char === quoteChar) {
          currentElement!.attributes.set(attrName, {
            name: attrName,
            value: attrValue,
            start: attrStart,
            end: pos + 1,
            valueStart: attrValueStart,
            valueEnd: pos,
          });
          state = 'TAG_SPACE';
        } else {
          attrValue += char;
        }
        break;

      case 'ATTR_VALUE_UQ':
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
          currentElement!.attributes.set(attrName, {
            name: attrName,
            value: attrValue,
            start: attrStart,
            end: pos,
            valueStart: attrValueStart,
            valueEnd: pos,
          });
          state = 'TAG_SPACE';
        } else if (char === '>') {
          currentElement!.attributes.set(attrName, {
            name: attrName,
            value: attrValue,
            start: attrStart,
            end: pos,
            valueStart: attrValueStart,
            valueEnd: pos,
          });
          currentElement!.openTagEnd = pos + 1;
          if (currentElement!.isVoid) {
            currentElement!.closeTagStart = pos + 1;
            currentElement!.closeTagEnd = pos + 1;
          }
          pushElement(currentElement!);
          findBindingsInAttributes(currentElement!, bindings);
          currentElement = null;
          state = 'TEXT';
          textContent = '';
          textStart = pos + 1;
        } else {
          attrValue += char;
        }
        break;

      case 'TAG_CLOSE':
        if (/[\w-]/.test(char)) {
          tagName += char;
        } else if (char === '>') {
          flushText();
          closeElement(tagName, tagStart, pos + 1);
          state = 'TEXT';
          textContent = '';
          textStart = pos + 1;
        } else if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
          // Space before > in closing tag, keep reading until >
        }
        break;

      case 'COMMENT':
        commentBuffer += char;
        if (commentBuffer.endsWith('-->')) {
          state = 'TEXT';
          textContent = '';
          textStart = pos + 1;
        }
        break;
    }

    pos++;
  }

  // Flush any remaining text
  flushText();

  return { roots, bindings, html };
}

// ============================================================================
// Helper Functions
// ============================================================================

function createEmptyElement(tagName: string, tagStart: number, tagNameEnd: number): HtmlElement {
  return {
    tagName,
    tagStart,
    tagNameEnd: tagNameEnd,
    openTagEnd: 0,
    closeTagStart: 0,
    closeTagEnd: 0,
    attributes: new Map(),
    children: [],
    parent: null,
    isSelfClosing: false,
    isVoid: VOID_ELEMENTS.has(tagName.toLowerCase()),
    textContent: [],
    whenDirective: undefined,
    whenDirectiveStart: undefined,
    whenDirectiveEnd: undefined,
  };
}

/**
 * Find ${this.signal()} expressions in text content
 */
function findBindingsInText(text: string, textStart: number, parent: HtmlElement | null, bindings: BindingInfo[]): void {
  if (!parent) return;

  const exprRegex = /\$\{this\.(\w+)\(\)\}/g;
  let match: RegExpExecArray | null;

  while ((match = exprRegex.exec(text)) !== null) {
    bindings.push({
      element: parent,
      type: 'text',
      signalName: match[1],
      expressionStart: textStart + match.index,
      expressionEnd: textStart + match.index + match[0].length,
      fullExpression: match[0],
    });
  }
}

/**
 * Find bindings in element attributes (style, when, regular attributes)
 */
function findBindingsInAttributes(element: HtmlElement, bindings: BindingInfo[]): void {
  // Check for when directive ("${when(...)}" syntax)
  if (element.whenDirective) {
    // Match "${when(...)}" and extract the inner expression
    const whenMatch = element.whenDirective.match(/^"\$\{when\((.+)\)\}"$/);
    if (whenMatch) {
      const innerExpr = whenMatch[1];
      // Find all signal getters: this.signalName() patterns
      const signalRegex = /this\.(\w+)\(\)/g;
      const signals: string[] = [];
      let signalMatch: RegExpExecArray | null;
      while ((signalMatch = signalRegex.exec(innerExpr)) !== null) {
        if (!signals.includes(signalMatch[1])) {
          signals.push(signalMatch[1]);
        }
      }

      if (signals.length > 0) {
        bindings.push({
          element,
          type: 'when',
          signalName: signals[0], // Primary signal (for backwards compatibility)
          signalNames: signals, // All signals in the expression
          expressionStart: element.whenDirectiveStart!,
          expressionEnd: element.whenDirectiveEnd!,
          fullExpression: element.whenDirective,
          jsExpression: innerExpr, // The raw JS expression like "!this._loading()"
        });
      }
    }
  }

  for (const [name, attr] of element.attributes) {

    // Check for style bindings
    if (name === 'style') {
      const styleExprRegex = /([\w-]+)\s*:\s*(\$\{this\.(\w+)\(\)\})/g;
      let styleMatch: RegExpExecArray | null;

      while ((styleMatch = styleExprRegex.exec(attr.value)) !== null) {
        // styleMatch[1] = property name (e.g., "color")
        // styleMatch[2] = full expression (e.g., "${this.color()}")
        // styleMatch[3] = signal name (e.g., "color")
        const exprStartInValue = styleMatch.index + styleMatch[0].indexOf(styleMatch[2]);
        bindings.push({
          element,
          type: 'style',
          signalName: styleMatch[3],
          property: styleMatch[1],
          expressionStart: attr.valueStart + exprStartInValue,
          expressionEnd: attr.valueStart + exprStartInValue + styleMatch[2].length,
          fullExpression: styleMatch[2],
        });
      }
      continue;
    }

    // Check for attribute bindings
    const attrExprRegex = /\$\{this\.(\w+)\(\)\}/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrExprRegex.exec(attr.value)) !== null) {
      bindings.push({
        element,
        type: 'attr',
        signalName: attrMatch[1],
        property: name,
        expressionStart: attr.valueStart + attrMatch.index,
        expressionEnd: attr.valueStart + attrMatch.index + attrMatch[0].length,
        fullExpression: attrMatch[0],
      });
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Walk the element tree depth-first
 */
export function walkElements(roots: HtmlElement[], callback: (element: HtmlElement, depth: number) => void): void {
  const walk = (elements: HtmlElement[], depth: number) => {
    for (const el of elements) {
      callback(el, depth);
      walk(el.children, depth + 1);
    }
  };
  walk(roots, 0);
}

/**
 * Find all elements matching a predicate
 */
export function findElements(roots: HtmlElement[], predicate: (el: HtmlElement) => boolean): HtmlElement[] {
  const results: HtmlElement[] = [];
  walkElements(roots, (el) => {
    if (predicate(el)) {
      results.push(el);
    }
  });
  return results;
}

/**
 * Find elements with a specific attribute
 */
export function findElementsWithAttribute(roots: HtmlElement[], attrName: string): HtmlElement[] {
  return findElements(roots, (el) => el.attributes.has(attrName));
}

/**
 * Find elements with the when directive ("${when(...)}" syntax)
 */
export function findElementsWithWhenDirective(roots: HtmlElement[]): HtmlElement[] {
  return findElements(roots, (el) => el.whenDirective !== undefined);
}

/**
 * Get the full HTML of an element (including open tag, content, close tag)
 */
export function getElementHtml(element: HtmlElement, html: string): string {
  return html.substring(element.tagStart, element.closeTagEnd);
}

/**
 * Get the inner HTML of an element (content only, no tags)
 */
export function getElementInnerHtml(element: HtmlElement, html: string): string {
  if (element.isSelfClosing || element.isVoid) {
    return '';
  }
  return html.substring(element.openTagEnd, element.closeTagStart);
}

/**
 * Get bindings for a specific element (including nested)
 */
export function getBindingsForElement(element: HtmlElement, bindings: BindingInfo[]): BindingInfo[] {
  const elementIds = new Set<HtmlElement>();

  const collectElements = (el: HtmlElement) => {
    elementIds.add(el);
    for (const child of el.children) {
      collectElements(child);
    }
  };
  collectElements(element);

  return bindings.filter((b) => elementIds.has(b.element));
}

/**
 * Check if an element is inside another element
 */
export function isElementInside(element: HtmlElement, container: HtmlElement): boolean {
  let current = element.parent;
  while (current) {
    if (current === container) return true;
    current = current.parent;
  }
  return false;
}
