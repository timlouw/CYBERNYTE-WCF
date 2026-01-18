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
  type: 'text' | 'style' | 'attr' | 'when' | 'whenElse' | 'repeat' | 'event';
  signalName: string;
  signalNames?: string[]; // For complex when/whenElse expressions with multiple signals
  property?: string; // For style/attr bindings
  expressionStart: number; // Position of ${
  expressionEnd: number; // Position after }
  fullExpression: string; // The full ${this.signal()} string
  /** For 'when'/'whenElse' bindings: the inner JS expression (the condition) */
  jsExpression?: string;
  /** For 'whenElse' bindings: the then template HTML */
  thenTemplate?: string;
  /** For 'whenElse' bindings: the else template HTML */
  elseTemplate?: string;
  /** For 'repeat' bindings: the items expression (e.g., "this._countries()") */
  itemsExpression?: string;
  /** For 'repeat' bindings: the item variable name in the template function */
  itemVar?: string;
  /** For 'repeat' bindings: the index variable name (if used) */
  indexVar?: string;
  /** For 'repeat' bindings: the item template HTML */
  itemTemplate?: string;
  /** For 'repeat' bindings: the empty template HTML (shown when list is empty) */
  emptyTemplate?: string;
  /** For 'repeat' bindings: custom trackBy function source code */
  trackByFn?: string;
  /** For 'event' bindings: the event name (e.g., 'click', 'mouseenter') */
  eventName?: string;
  /** For 'event' bindings: modifiers like 'stop', 'prevent', 'self', 'enter' */
  eventModifiers?: string[];
  /** For 'event' bindings: the handler expression (method reference or arrow function) */
  handlerExpression?: string;
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

  // Track ${...} expressions in text to avoid parsing nested html`` as HTML
  let exprBraceDepth = 0; // > 0 means we're inside ${...}
  let inTemplateBacktick = false; // inside html`...` within an expression
  let templateBraceDepth = 0; // for ${} inside template literals

  const flushText = () => {
    if (textContent.trim()) {
      const parent = elementStack[elementStack.length - 1];
      if (parent) {
        parent.textContent.push({
          content: textContent,
          start: textStart,
          end: pos,
        });
        // Check for bindings in text
        findBindingsInText(textContent, textStart, parent, bindings);
      } else {
        // Text at root level (no parent element) - still check for bindings
        // Create a virtual root element for binding detection
        const virtualRoot: HtmlElement = {
          tagName: '__root__',
          tagStart: 0,
          tagNameEnd: 0,
          openTagEnd: 0,
          closeTagStart: 0,
          closeTagEnd: 0,
          attributes: new Map(),
          children: [],
          parent: null,
          isSelfClosing: false,
          isVoid: false,
          textContent: [],
        };
        findBindingsInText(textContent, textStart, virtualRoot, bindings);
      }
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
        // Track ${...} expressions to avoid parsing nested html`` as HTML
        if (char === '$' && nextChar === '{' && !inTemplateBacktick) {
          // Start of ${...} expression
          if (textContent === '') {
            textStart = pos;
          }
          textContent += '${';
          pos += 2;
          exprBraceDepth = 1;
          continue;
        }

        // Inside ${...} expression - track braces and backticks
        if (exprBraceDepth > 0) {
          if (textContent === '') {
            textStart = pos;
          }

          if (inTemplateBacktick) {
            // Inside html`...` template
            if (char === '$' && nextChar === '{') {
              // Nested ${} inside template
              templateBraceDepth++;
              textContent += '${';
              pos += 2;
              continue;
            }
            if (char === '}' && templateBraceDepth > 0) {
              // Closing nested ${} inside template
              templateBraceDepth--;
              textContent += char;
              pos++;
              continue;
            }
            if (char === '`' && templateBraceDepth === 0) {
              // Closing backtick of html`...`
              inTemplateBacktick = false;
              textContent += char;
              pos++;
              continue;
            }
            // Regular char inside template - just accumulate
            textContent += char;
            pos++;
            continue;
          }

          // Not inside template literal, but inside ${...}
          if (char === '`') {
            // Start of template literal (html`...`)
            inTemplateBacktick = true;
            templateBraceDepth = 0;
            textContent += char;
            pos++;
            continue;
          }
          if (char === '{') {
            exprBraceDepth++;
            textContent += char;
            pos++;
            continue;
          }
          if (char === '}') {
            exprBraceDepth--;
            textContent += char;
            pos++;
            if (exprBraceDepth === 0) {
              // End of ${...} expression - continue normal text parsing
            }
            continue;
          }
          // Regular char inside expression - just accumulate
          textContent += char;
          pos++;
          continue;
        }

        // Normal text parsing
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
        } else if (char === '$' && nextChar === '{') {
          // Handle unquoted ${...} expression as attribute value
          // This is common for event bindings like @click=${handler}
          attrValueStart = pos;
          let braceDepth = 0;
          let i = pos;
          while (i < html.length) {
            if (html[i] === '$' && html[i + 1] === '{') {
              braceDepth++;
              i += 2;
              continue;
            }
            if (html[i] === '{') {
              // Regular brace inside the expression (e.g., arrow function body)
              braceDepth++;
            } else if (html[i] === '}') {
              braceDepth--;
              if (braceDepth === 0) {
                // Found the end of the ${...} expression
                attrValue = html.substring(attrValueStart, i + 1);
                currentElement!.attributes.set(attrName, {
                  name: attrName,
                  value: attrValue,
                  start: attrStart,
                  end: i + 1,
                  valueStart: attrValueStart,
                  valueEnd: i + 1,
                });
                pos = i;
                state = 'TAG_SPACE';
                break;
              }
            }
            i++;
          }
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
 * Find ${this.signal()}, ${whenElse(...)}, and ${repeat(...)} expressions in text content
 */
function findBindingsInText(text: string, textStart: number, parent: HtmlElement | null, bindings: BindingInfo[]): void {
  if (!parent) return;

  // Track positions of complex expressions to exclude from simple signal detection
  const complexExprPositions: Array<{ start: number; end: number }> = [];

  // Find ${whenElse(...)} expressions - need to handle nested html`` templates
  const whenElseRegex = /\$\{whenElse\(/g;
  let whenElseMatch: RegExpExecArray | null;

  while ((whenElseMatch = whenElseRegex.exec(text)) !== null) {
    const startPos = whenElseMatch.index;
    // Parse the whenElse expression to find its end, handling nested templates
    const parsed = parseWhenElseExpression(text, startPos);
    if (parsed) {
      complexExprPositions.push({ start: startPos, end: parsed.end });

      bindings.push({
        element: parent,
        type: 'whenElse',
        signalName: parsed.signals[0] || '',
        signalNames: parsed.signals,
        expressionStart: textStart + startPos,
        expressionEnd: textStart + parsed.end,
        fullExpression: text.substring(startPos, parsed.end),
        jsExpression: parsed.condition,
        thenTemplate: parsed.thenTemplate,
        elseTemplate: parsed.elseTemplate,
      });
    }
  }

  // Find ${repeat(...)} expressions
  const repeatRegex = /\$\{repeat\(/g;
  let repeatMatch: RegExpExecArray | null;

  while ((repeatMatch = repeatRegex.exec(text)) !== null) {
    const startPos = repeatMatch.index;
    const parsed = parseRepeatExpression(text, startPos);
    if (parsed) {
      complexExprPositions.push({ start: startPos, end: parsed.end });

      bindings.push({
        element: parent,
        type: 'repeat',
        signalName: parsed.signals[0] || '',
        signalNames: parsed.signals,
        expressionStart: textStart + startPos,
        expressionEnd: textStart + parsed.end,
        fullExpression: text.substring(startPos, parsed.end),
        itemsExpression: parsed.itemsExpression,
        itemVar: parsed.itemVar,
        indexVar: parsed.indexVar,
        itemTemplate: parsed.itemTemplate,
        emptyTemplate: parsed.emptyTemplate,
        trackByFn: parsed.trackByFn,
      });
    }
  }

  // Find simple ${this.signal()} expressions, excluding those inside complex expressions
  const exprRegex = /\$\{this\.(\w+)\(\)\}/g;
  let match: RegExpExecArray | null;

  while ((match = exprRegex.exec(text)) !== null) {
    const pos = match.index;
    // Skip if this position is inside a complex expression
    const insideComplex = complexExprPositions.some((cp) => pos >= cp.start && pos < cp.end);
    if (insideComplex) continue;

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
 * Parse a whenElse expression to extract condition and templates.
 * Handles nested html`` templates by tracking backtick depth.
 */
function parseWhenElseExpression(
  text: string,
  startPos: number,
): {
  end: number;
  condition: string;
  thenTemplate: string;
  elseTemplate: string;
  signals: string[];
} | null {
  // Start after "${whenElse("
  let pos = startPos + '${whenElse('.length;
  let parenDepth = 1; // We're inside whenElse(

  // Track the three arguments: condition, thenTemplate, elseTemplate
  const args: string[] = [];
  let currentArg = '';
  let inBacktick = false;
  let templateBraceDepth = 0; // Track ${...} inside template literals

  while (pos < text.length) {
    const char = text[pos];

    // Handle backtick strings (html`...`)
    if (char === '`' && !inBacktick) {
      inBacktick = true;
      templateBraceDepth = 0;
      currentArg += char;
      pos++;
      continue;
    }

    if (char === '`' && inBacktick && templateBraceDepth === 0) {
      // Closing backtick
      inBacktick = false;
      currentArg += char;
      pos++;
      continue;
    }

    // Handle ${...} inside backtick strings
    if (inBacktick && char === '$' && text[pos + 1] === '{') {
      templateBraceDepth++;
      currentArg += '${';
      pos += 2;
      continue;
    }

    // Handle } inside template ${...}
    if (inBacktick && char === '}' && templateBraceDepth > 0) {
      templateBraceDepth--;
      currentArg += char;
      pos++;
      continue;
    }

    if (inBacktick) {
      currentArg += char;
      pos++;
      continue;
    }

    // Outside backticks - track parens
    if (char === '(') {
      parenDepth++;
      currentArg += char;
    } else if (char === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        // End of whenElse arguments
        args.push(currentArg.trim());
        pos++; // Move past )
        // Should hit } next
        if (text[pos] === '}') {
          pos++;
        }
        break;
      }
      currentArg += char;
    } else if (char === ',' && parenDepth === 1) {
      // Argument separator at top level
      args.push(currentArg.trim());
      currentArg = '';
    } else {
      currentArg += char;
    }

    pos++;
  }

  if (args.length !== 3) {
    return null; // Invalid whenElse - needs exactly 3 arguments
  }

  const condition = args[0];
  const thenTemplate = extractHtmlTemplateContent(args[1]);
  const elseTemplate = extractHtmlTemplateContent(args[2]);

  // Extract signals from condition
  const signalRegex = /this\.(\w+)\(\)/g;
  const signals: string[] = [];
  let signalMatch: RegExpExecArray | null;
  while ((signalMatch = signalRegex.exec(condition)) !== null) {
    if (!signals.includes(signalMatch[1])) {
      signals.push(signalMatch[1]);
    }
  }

  return {
    end: pos,
    condition,
    thenTemplate,
    elseTemplate,
    signals,
  };
}

/**
 * Parse a repeat expression to extract items expression, item variable, and template.
 * Format: ${repeat(this._items(), (item, index) => html`<div>${item}</div>`)}
 * or:     ${repeat(this._items(), (item) => html`<div>${item}</div>`)}
 * or:     ${repeat(this._items(), (item) => html`<div>${item}</div>`, html`<p>Empty</p>`)}
 * or:     ${repeat(this._items(), (item) => html`<div>${item}</div>`, null, (item) => item.id)}
 */
function parseRepeatExpression(
  text: string,
  startPos: number,
): {
  end: number;
  itemsExpression: string;
  itemVar: string;
  indexVar?: string;
  itemTemplate: string;
  emptyTemplate?: string;
  trackByFn?: string;
  signals: string[];
} | null {
  // Start after "${repeat("
  let pos = startPos + '${repeat('.length;
  let parenDepth = 1; // We're inside repeat(

  // Track the arguments: items expression, template function, optional empty template, optional trackBy
  const args: string[] = [];
  let currentArg = '';
  let inBacktick = false;
  let templateBraceDepth = 0;

  while (pos < text.length) {
    const char = text[pos];

    // Handle backtick strings (html`...`)
    if (char === '`' && !inBacktick) {
      inBacktick = true;
      templateBraceDepth = 0;
      currentArg += char;
      pos++;
      continue;
    }

    if (char === '`' && inBacktick && templateBraceDepth === 0) {
      // Closing backtick
      inBacktick = false;
      currentArg += char;
      pos++;
      continue;
    }

    // Handle ${...} inside backtick strings
    if (inBacktick && char === '$' && text[pos + 1] === '{') {
      templateBraceDepth++;
      currentArg += '${';
      pos += 2;
      continue;
    }

    // Handle } inside template ${...}
    if (inBacktick && char === '}' && templateBraceDepth > 0) {
      templateBraceDepth--;
      currentArg += char;
      pos++;
      continue;
    }

    if (inBacktick) {
      currentArg += char;
      pos++;
      continue;
    }

    // Outside backticks - track parens
    if (char === '(') {
      parenDepth++;
      currentArg += char;
    } else if (char === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        // End of repeat arguments
        args.push(currentArg.trim());
        pos++; // Move past )
        // Should hit } next
        if (text[pos] === '}') {
          pos++;
        }
        break;
      }
      currentArg += char;
    } else if (char === ',' && parenDepth === 1) {
      // Argument separator at top level
      args.push(currentArg.trim());
      currentArg = '';
    } else {
      currentArg += char;
    }

    pos++;
  }

  if (args.length < 2 || args.length > 4) {
    return null; // Invalid repeat - needs 2-4 arguments (items, templateFn, [emptyTemplate], [trackBy])
  }

  const itemsExpression = args[0];

  // Parse the arrow function: (item) => html`...` or (item, index) => html`...`
  const templateFn = args[1];
  const arrowMatch = templateFn.match(/^\(([^)]*)\)\s*=>\s*(.*)$/s);
  if (!arrowMatch) {
    return null;
  }

  const params = arrowMatch[1].split(',').map((p) => p.trim());
  const itemVar = params[0];
  const indexVar = params[1]; // May be undefined if only item param

  const templateBody = arrowMatch[2].trim();
  const itemTemplate = extractHtmlTemplateContent(templateBody);

  // Parse optional empty template (third argument)
  let emptyTemplate: string | undefined;
  if (args.length >= 3 && args[2].trim() !== 'null' && args[2].trim() !== 'undefined') {
    emptyTemplate = extractHtmlTemplateContent(args[2].trim());
  }

  // Parse optional trackBy function (fourth argument)
  let trackByFn: string | undefined;
  if (args.length === 4) {
    trackByFn = args[3].trim();
  }

  // Extract signals from items expression (e.g., this._countries())
  const signalRegex = /this\.(\w+)\(\)/g;
  const signals: string[] = [];
  let signalMatch: RegExpExecArray | null;
  while ((signalMatch = signalRegex.exec(itemsExpression)) !== null) {
    if (!signals.includes(signalMatch[1])) {
      signals.push(signalMatch[1]);
    }
  }

  return {
    end: pos,
    itemsExpression,
    itemVar,
    indexVar,
    itemTemplate,
    emptyTemplate,
    trackByFn,
    signals,
  };
}

/**
 * Extract the HTML content from an html`...` template literal
 */
function extractHtmlTemplateContent(arg: string): string {
  // Match html`...` and extract the content
  const match = arg.match(/^html`([\s\S]*)`$/);
  if (match) {
    return match[1];
  }
  return arg; // Return as-is if not wrapped in html``
}

/**
 * Find bindings in element attributes (style, when, events, regular attributes)
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
    // Check for event bindings (@click, @click.stop, @keydown.enter, etc.)
    if (name.startsWith('@')) {
      // Parse event name and modifiers: @click.stop.prevent -> eventName: 'click', modifiers: ['stop', 'prevent']
      const eventParts = name.slice(1).split('.'); // Remove '@' and split by '.'
      const eventName = eventParts[0];
      const modifiers = eventParts.slice(1);

      // The value should be ${handler} where handler is a method reference or arrow function
      const eventExprMatch = attr.value.match(/^\$\{(.+)\}$/s);
      if (eventExprMatch) {
        const handlerExpression = eventExprMatch[1].trim();
        bindings.push({
          element,
          type: 'event',
          signalName: '', // Not signal-based
          eventName,
          eventModifiers: modifiers,
          handlerExpression,
          expressionStart: attr.start,
          expressionEnd: attr.end,
          fullExpression: `@${name.slice(1)}="${attr.value}"`,
        });
      }
      continue;
    }

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
// ============================================================================
// HTML Modification Utilities (Step C Consolidation)
// ============================================================================

/**
 * Edit descriptor for HTML string modifications.
 * Applied in reverse order (highest start index first) to avoid position shifts.
 */
export interface HtmlEdit {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Apply a list of edits to an HTML string.
 * Automatically sorts edits in reverse order to apply from end to start.
 */
export function applyHtmlEdits(html: string, edits: HtmlEdit[]): string {
  // Sort by start position descending
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = html;
  for (const edit of sorted) {
    result = result.substring(0, edit.start) + edit.replacement + result.substring(edit.end);
  }
  return result;
}

/**
 * Create an edit to inject an ID attribute into an element's opening tag.
 * Returns null if the element already has an ID.
 */
export function createIdInjectionEdit(element: HtmlElement, id: string): HtmlEdit | null {
  if (element.attributes.has('id')) {
    return null;
  }
  return {
    start: element.tagNameEnd,
    end: element.tagNameEnd,
    replacement: ` id="${id}"`,
  };
}

/**
 * Create an edit to inject a data attribute into an element's opening tag.
 */
export function createDataAttrEdit(element: HtmlElement, attrName: string, attrValue: string): HtmlEdit {
  return {
    start: element.tagNameEnd,
    end: element.tagNameEnd,
    replacement: ` ${attrName}="${attrValue}"`,
  };
}

/**
 * Create an edit to remove the when directive from an element.
 */
export function createWhenDirectiveRemovalEdit(element: HtmlElement): HtmlEdit | null {
  if (!element.whenDirective || element.whenDirectiveStart === undefined || element.whenDirectiveEnd === undefined) {
    return null;
  }
  return {
    start: element.whenDirectiveStart,
    end: element.whenDirectiveEnd,
    replacement: '',
  };
}

/**
 * Create an edit to remove an event binding attribute (@event=${...}).
 */
export function createEventBindingRemovalEdit(binding: BindingInfo): HtmlEdit | null {
  if (binding.type !== 'event') {
    return null;
  }
  return {
    start: binding.expressionStart,
    end: binding.expressionEnd,
    replacement: '',
  };
}

/**
 * Create edits to replace signal expressions with static values.
 * Only replaces expressions outside of specified ranges (e.g., conditionals).
 */
export function createSignalReplacementEdits(
  html: string,
  signalValues: Map<string, string | number | boolean>,
  excludeRanges: Array<{ start: number; end: number }> = [],
): HtmlEdit[] {
  const edits: HtmlEdit[] = [];
  const exprRegex = /\$\{this\.(\w+)\(\)\}/g;
  let match: RegExpExecArray | null;

  while ((match = exprRegex.exec(html)) !== null) {
    const exprStart = match.index;
    const exprEnd = exprStart + match[0].length;

    // Skip if inside an excluded range
    const insideExcluded = excludeRanges.some((r) => exprStart >= r.start && exprStart < r.end);
    if (insideExcluded) continue;

    const signalName = match[1];
    const value = signalValues.get(signalName);
    if (value !== undefined) {
      edits.push({
        start: exprStart,
        end: exprEnd,
        replacement: String(value),
      });
    }
  }

  return edits;
}

/**
 * Extract event bindings from parsed template with full context.
 * Returns enriched binding info including element IDs and modifiers.
 */
export interface EventBindingDescriptor {
  element: HtmlElement;
  eventName: string;
  modifiers: string[];
  handlerExpression: string;
  expressionStart: number;
  expressionEnd: number;
}

export function extractEventBindings(parsed: ParsedTemplate): EventBindingDescriptor[] {
  const result: EventBindingDescriptor[] = [];

  for (const binding of parsed.bindings) {
    if (binding.type === 'event' && binding.eventName && binding.handlerExpression) {
      result.push({
        element: binding.element,
        eventName: binding.eventName,
        modifiers: binding.eventModifiers || [],
        handlerExpression: binding.handlerExpression,
        expressionStart: binding.expressionStart,
        expressionEnd: binding.expressionEnd,
      });
    }
  }

  return result;
}

/**
 * Group bindings by their containing element.
 */
export function groupBindingsByElement(bindings: BindingInfo[]): Map<HtmlElement, BindingInfo[]> {
  const map = new Map<HtmlElement, BindingInfo[]>();
  for (const binding of bindings) {
    if (!map.has(binding.element)) {
      map.set(binding.element, []);
    }
    map.get(binding.element)!.push(binding);
  }
  return map;
}

/**
 * Check if a position is inside any of the given ranges.
 */
export function isPositionInRanges(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((r) => pos >= r.start && pos < r.end);
}

/**
 * Find all elements that need IDs assigned based on bindings.
 * Returns elements with text, style, attr, or event bindings.
 */
export function findElementsNeedingIds(parsed: ParsedTemplate): HtmlElement[] {
  const elementsSet = new Set<HtmlElement>();

  for (const binding of parsed.bindings) {
    if (binding.type === 'text' || binding.type === 'style' || binding.type === 'attr' || binding.type === 'event') {
      elementsSet.add(binding.element);
    }
  }

  return Array.from(elementsSet);
}

/**
 * Create a unique ID generator function.
 */
export function createIdGenerator(prefix: string, startFrom = 0): () => string {
  let counter = startFrom;
  return () => `${prefix}${counter++}`;
}

/**
 * Normalize HTML by collapsing whitespace.
 * Preserves single spaces but removes excessive whitespace.
 */
export function normalizeHtmlWhitespace(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/\s+>/g, '>').replace(/>\s+</g, '><').trim();
}

/**
 * Inject an ID into the first element of an HTML string.
 * Used for whenElse template processing.
 */
export function injectIdIntoFirstElement(html: string, id: string): string {
  // Find the first < that starts an element (not a closing tag)
  const trimmed = html.trim();
  const firstTagMatch = trimmed.match(/^<(\w+)/);
  if (!firstTagMatch) {
    return trimmed;
  }

  const tagName = firstTagMatch[1];
  const tagNameEnd = tagName.length + 1; // +1 for '<'

  return trimmed.substring(0, tagNameEnd) + ` id="${id}"` + trimmed.substring(tagNameEnd);
}
