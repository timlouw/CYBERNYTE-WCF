/**
 * Reactive Binding Compiler Plugin
 *
 * Transforms signal expressions in templates into efficient DOM bindings.
 * Generates static templates and binding initialization code.
 * Supports conditional rendering with "${when(this.signal())}" directives.
 *
 * Uses a state machine HTML parser for robust handling of nested elements,
 * expressions in attributes, and complex template structures.
 *
 * @example
 * // Before: html`<span>${this.count()}</span>`
 * // After:  static template with `<span id="b0">0</span>`
 * //         + initializeBindings() { const b0 = r.getElementById('b0'); this.count.subscribe(v => { b0.textContent = v; }); }
 *
 * @example Conditional rendering
 * // Before: html`<div "${when(this.isVisible())}">${this.count()}</div>`
 * // After:  static template with `<div id="b0">0</div>` (if initial true) or `<template id="b0"></template>` (if initial false)
 * //         + __bindIf(r, this.isVisible, 'b0', '<div id="b0">0</div>', () => { ... nested bindings ... });
 */
import fs from 'fs';
import { Plugin } from 'esbuild';
import ts from 'typescript';
import type { SignalExpression, ImportInfo, TemplateInfo } from '../../types.js';
import {
  findComponentClass,
  findSignalInitializers,
  getSignalGetterName,
  extractTemplateContent,
  isHtmlTemplate,
  isCssTemplate,
  applyEdits,
  sourceCache,
  logger,
  hasHtmlTemplates,
  extendsComponent,
  toCamelCase,
  createLoaderResult,
  PLUGIN_NAME,
  BIND_FN,
} from '../../utils/index.js';
import {
  parseHtmlTemplate,
  walkElements,
  findElementsWithWhenDirective,
  getElementHtml,
  getBindingsForElement,
  type HtmlElement,
  type ParsedTemplate,
} from '../../utils/html-parser.js';

const NAME = PLUGIN_NAME.REACTIVE;

// ============================================================================
// Types for Conditional Binding
// ============================================================================

interface ConditionalBlock {
  id: string;
  signalName: string; // Primary signal (for simple cases)
  signalNames: string[]; // All signals in the expression
  jsExpression: string; // The full JS expression e.g. "!this._loading()" or "this._a() && this._b()"
  initialValue: boolean;
  templateContent: string; // HTML to insert when true
  startIndex: number; // Position in HTML where the element/block starts
  endIndex: number; // Position where it ends
  nestedBindings: BindingInfo[]; // Bindings inside this conditional
}

interface WhenElseBlock {
  thenId: string; // ID for the "then" conditional element
  elseId: string; // ID for the "else" conditional element
  signalName: string; // Primary signal
  signalNames: string[]; // All signals in the expression
  jsExpression: string; // The condition expression
  initialValue: boolean;
  thenTemplate: string; // HTML to insert when true
  elseTemplate: string; // HTML to insert when false
  startIndex: number; // Position in HTML where ${whenElse starts
  endIndex: number; // Position after }
  thenBindings: BindingInfo[]; // Bindings inside then template
  elseBindings: BindingInfo[]; // Bindings inside else template
  nestedConditionals: ConditionalBlock[]; // Nested when blocks inside then/else
  nestedWhenElse: WhenElseBlock[]; // Nested whenElse blocks inside then/else
}

interface RepeatBlock {
  id: string; // ID for the anchor element
  signalName: string; // Primary signal (the array signal)
  signalNames: string[]; // All signals in the expression
  itemsExpression: string; // e.g., "this._countries()"
  itemVar: string; // e.g., "country"
  indexVar?: string; // e.g., "index" (optional)
  itemTemplate: string; // HTML template for each item
  emptyTemplate?: string; // HTML template shown when list is empty
  trackByFn?: string; // Custom trackBy function source
  startIndex: number; // Position in HTML where ${repeat starts
  endIndex: number; // Position after }
  itemBindings: BindingInfo[]; // Bindings inside item template
}

interface EventBinding {
  id: string; // Unique ID for this event handler (e.g., 'e0', 'e1')
  eventName: string; // Event type (e.g., 'click', 'mouseenter')
  modifiers: string[]; // Event modifiers (e.g., ['stop', 'prevent'])
  handlerExpression: string; // The handler code (method reference or arrow function)
  elementId: string; // ID of the element with the event binding
  startIndex: number; // Position in HTML where @event= starts
  endIndex: number; // Position after closing quote
}

interface BindingInfo {
  id: string;
  signalName: string;
  type: 'text' | 'style' | 'attr';
  property?: string; // For style/attr bindings
  isInsideConditional: boolean;
  conditionalId?: string; // Which conditional block this is inside
}

// ============================================================================
// Import Detection
// ============================================================================

/**
 * Find import declarations that import from shadow-dom (Component, registerComponent).
 * These imports will be updated to include bind functions from dom/index.
 */
const findServicesImport = (sourceFile: ts.SourceFile): ImportInfo | null => {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;

      if (specifier.includes('shadow-dom') || specifier.includes('dom/index')) {
        const namedImports: string[] = [];

        if (statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
          for (const element of statement.importClause.namedBindings.elements) {
            namedImports.push(element.name.text);
          }
        }

        const fullText = statement.moduleSpecifier.getFullText(sourceFile);
        const quoteChar = fullText.includes("'") ? "'" : '"';
        const normalizedSpecifier = specifier.includes('shadow-dom') ? specifier.replace('shadow-dom.js', 'index.js').replace('shadow-dom', 'index') : specifier;

        return {
          namedImports,
          moduleSpecifier: normalizedSpecifier,
          start: statement.getStart(sourceFile),
          end: statement.getEnd(),
          quoteChar,
        };
      }
    }
  }
  return null;
};

/**
 * Find all html tagged template literals and extract signal expressions.
 * Only finds top-level html templates, not nested ones inside expressions.
 */
const findHtmlTemplates = (sourceFile: ts.SourceFile): TemplateInfo[] => {
  const templates: TemplateInfo[] = [];

  const visit = (node: ts.Node, insideHtmlTemplate: boolean) => {
    if (ts.isTaggedTemplateExpression(node) && isHtmlTemplate(node)) {
      // If we're already inside an html template, don't process this one
      // It's likely a nested template inside a whenElse expression
      if (insideHtmlTemplate) {
        return; // Don't process or recurse into nested html templates
      }

      const template = node.template;
      const expressions: SignalExpression[] = [];

      if (ts.isTemplateExpression(template)) {
        for (const span of template.templateSpans) {
          if (ts.isCallExpression(span.expression)) {
            const signalName = getSignalGetterName(span.expression);
            if (signalName) {
              expressions.push({
                signalName,
                fullExpression: span.expression.getText(sourceFile),
                start: span.expression.getStart(sourceFile),
                end: span.expression.getEnd(),
              });
            }
          }
        }
      }

      templates.push({
        node,
        expressions,
        templateStart: node.getStart(sourceFile),
        templateEnd: node.getEnd(),
      });

      // When recursing into this template's children, mark that we're inside an html template
      ts.forEachChild(node, (child) => visit(child, true));
      return; // Don't use the default forEachChild below
    }

    ts.forEachChild(node, (child) => visit(child, insideHtmlTemplate));
  };

  visit(sourceFile, false);
  return templates;
};

// ============================================================================
// HTML Template Processing (using State Machine Parser)
// ============================================================================

/**
 * Process HTML template content using the state machine parser.
 * This is more robust than regex-based parsing and handles:
 * - Deeply nested elements
 * - Expressions in attributes
 * - Nested same-name tags
 * - Complex template structures
 * - Event bindings (@click, @mouseenter, etc.)
 */
const processHtmlTemplateWithConditionals = (
  templateContent: string,
  signalInitializers: Map<string, string | number | boolean>,
  startingId: number,
): {
  processedContent: string;
  bindings: BindingInfo[];
  conditionals: ConditionalBlock[];
  whenElseBlocks: WhenElseBlock[];
  repeatBlocks: RepeatBlock[];
  eventBindings: EventBinding[];
  nextId: number;
  hasConditionals: boolean;
} => {
  // Parse the HTML using the state machine parser
  const parsed = parseHtmlTemplate(templateContent);

  const bindings: BindingInfo[] = [];
  const conditionals: ConditionalBlock[] = [];
  const whenElseBlocks: WhenElseBlock[] = [];
  const repeatBlocks: RepeatBlock[] = [];
  const eventBindings: EventBinding[] = [];
  let idCounter = startingId;
  let eventIdCounter = 0;

  // Track which elements need IDs and what ID they get
  const elementIdMap = new Map<HtmlElement, string>();

  // Find all conditional elements (those with when directive)
  const conditionalElements = findElementsWithWhenDirective(parsed.roots);
  const conditionalElementSet = new Set(conditionalElements);

  // Create a set of all elements that are inside conditionals (for filtering)
  const elementsInsideConditionals = new Set<HtmlElement>();
  for (const condEl of conditionalElements) {
    walkElements([condEl], (el) => {
      if (el !== condEl) {
        elementsInsideConditionals.add(el);
      }
    });
  }

  // First pass: Process conditionals and assign IDs
  for (const condEl of conditionalElements) {
    // Find the 'when' binding for this element to get parsed expression info
    const whenBinding = parsed.bindings.find((b) => b.element === condEl && b.type === 'when');
    if (!whenBinding || !whenBinding.jsExpression) continue;

    const signalNames = whenBinding.signalNames || [whenBinding.signalName];
    const jsExpression = whenBinding.jsExpression;

    const conditionalId = `b${idCounter++}`;
    elementIdMap.set(condEl, conditionalId);

    // Evaluate initial value by replacing signal getters with their initial values
    let evalExpr = jsExpression;
    for (const sigName of signalNames) {
      const initialVal = signalInitializers.get(sigName);
      // Replace this.signalName() with the actual initial value
      const sigRegex = new RegExp(`this\\.${sigName}\\(\\)`, 'g');
      evalExpr = evalExpr.replace(sigRegex, JSON.stringify(initialVal ?? false));
    }
    // Safely evaluate the expression with initial values
    let initialValue = false;
    try {
      initialValue = Boolean(eval(evalExpr));
    } catch (e) {
      // If evaluation fails, default to false
    }

    // Get bindings for this conditional element and its children
    const condBindings = getBindingsForElement(condEl, parsed.bindings);
    const nestedBindings: BindingInfo[] = [];

    for (const binding of condBindings) {
      // Get or assign ID for the element
      let elementId: string;
      if (binding.element === condEl) {
        // Binding on the conditional element itself uses the conditional ID
        elementId = conditionalId;
      } else {
        // Nested element - check if we already assigned an ID
        if (!elementIdMap.has(binding.element)) {
          elementIdMap.set(binding.element, `b${idCounter++}`);
        }
        elementId = elementIdMap.get(binding.element)!;
      }

      // Skip the 'when' binding itself
      if (binding.type === 'when') continue;

      nestedBindings.push({
        id: elementId,
        signalName: binding.signalName,
        type: binding.type as 'text' | 'style' | 'attr',
        property: binding.property,
        isInsideConditional: true,
        conditionalId,
      });
    }

    // Generate the processed HTML for this conditional element
    const processedCondHtml = processConditionalElementHtml(condEl, templateContent, signalInitializers, elementIdMap, conditionalId);

    conditionals.push({
      id: conditionalId,
      signalName: signalNames[0], // Primary signal for backwards compatibility
      signalNames,
      jsExpression,
      initialValue,
      templateContent: processedCondHtml,
      startIndex: condEl.tagStart,
      endIndex: condEl.closeTagEnd,
      nestedBindings,
    });

    bindings.push(...nestedBindings);
  }

  // Process whenElse bindings (inline conditional rendering)
  for (const binding of parsed.bindings) {
    if (binding.type !== 'whenElse') continue;
    if (!binding.jsExpression || !binding.thenTemplate || !binding.elseTemplate) continue;

    const signalNames = binding.signalNames || [binding.signalName];
    const jsExpression = binding.jsExpression;

    // Assign two IDs - one for then, one for else
    const thenId = `b${idCounter++}`;
    const elseId = `b${idCounter++}`;

    // Evaluate initial value
    let evalExpr = jsExpression;
    for (const sigName of signalNames) {
      const initialVal = signalInitializers.get(sigName);
      const sigRegex = new RegExp(`this\\.${sigName}\\(\\)`, 'g');
      evalExpr = evalExpr.replace(sigRegex, JSON.stringify(initialVal ?? false));
    }
    let initialValue = false;
    try {
      initialValue = Boolean(eval(evalExpr));
    } catch (e) {
      // If evaluation fails, default to false
    }

    // Process nested bindings in then/else templates (with full nesting support)
    const thenProcessed = processSubTemplateWithNesting(binding.thenTemplate, signalInitializers, idCounter, thenId);
    idCounter = thenProcessed.nextId;
    const elseProcessed = processSubTemplateWithNesting(binding.elseTemplate, signalInitializers, idCounter, elseId);
    idCounter = elseProcessed.nextId;

    whenElseBlocks.push({
      thenId,
      elseId,
      signalName: signalNames[0] || '',
      signalNames,
      jsExpression,
      initialValue,
      thenTemplate: thenProcessed.processedContent,
      elseTemplate: elseProcessed.processedContent,
      startIndex: binding.expressionStart,
      endIndex: binding.expressionEnd,
      thenBindings: thenProcessed.bindings,
      elseBindings: elseProcessed.bindings,
      nestedConditionals: [...thenProcessed.conditionals, ...elseProcessed.conditionals],
      nestedWhenElse: [...thenProcessed.whenElseBlocks, ...elseProcessed.whenElseBlocks],
    });
  }

  // Process repeat bindings (list rendering)
  for (const binding of parsed.bindings) {
    if (binding.type !== 'repeat') continue;
    if (!binding.itemsExpression || !binding.itemVar || !binding.itemTemplate) continue;

    const signalNames = binding.signalNames || [binding.signalName];
    const repeatId = `b${idCounter++}`;

    // Process the item template to find any bindings inside it
    // Note: Item templates may use ${item} or ${item.property} patterns, not signals
    const itemTemplateProcessed = processItemTemplate(binding.itemTemplate, binding.itemVar, binding.indexVar, idCounter);
    idCounter = itemTemplateProcessed.nextId;

    // Process empty template if provided
    let processedEmptyTemplate: string | undefined;
    if (binding.emptyTemplate) {
      processedEmptyTemplate = binding.emptyTemplate.replace(/\s+/g, ' ').trim();
    }

    repeatBlocks.push({
      id: repeatId,
      signalName: signalNames[0] || '',
      signalNames,
      itemsExpression: binding.itemsExpression,
      itemVar: binding.itemVar,
      indexVar: binding.indexVar,
      itemTemplate: itemTemplateProcessed.processedContent,
      emptyTemplate: processedEmptyTemplate,
      trackByFn: binding.trackByFn,
      startIndex: binding.expressionStart,
      endIndex: binding.expressionEnd,
      itemBindings: itemTemplateProcessed.bindings,
    });
  }

  // Second pass: Process non-conditional bindings
  // For text bindings, we wrap them in <span> elements for precise updates
  // This handles both pure text elements and mixed content cases
  const textBindingSpans = new Map<number, string>(); // Map expression position to span ID

  for (const binding of parsed.bindings) {
    // Skip if this element is inside a conditional
    if (elementsInsideConditionals.has(binding.element)) continue;
    // Skip if this is a conditional element (already processed)
    if (conditionalElementSet.has(binding.element)) continue;
    // Skip 'when' bindings (they're handled as conditionals)
    if (binding.type === 'when') continue;
    // Skip 'whenElse' bindings (they're handled separately)
    if (binding.type === 'whenElse') continue;
    // Skip 'repeat' bindings (they're handled separately)
    if (binding.type === 'repeat') continue;
    // Skip 'event' bindings (they're handled separately below)
    if (binding.type === 'event') continue;

    // For text bindings, wrap in a span element for precise updates
    if (binding.type === 'text') {
      const spanId = `b${idCounter++}`;
      textBindingSpans.set(binding.expressionStart, spanId);

      bindings.push({
        id: spanId,
        signalName: binding.signalName,
        type: 'text',
        property: binding.property,
        isInsideConditional: false,
        conditionalId: undefined,
      });
      continue;
    }

    // Get or assign ID for the element (style/attr bindings)
    if (!elementIdMap.has(binding.element)) {
      elementIdMap.set(binding.element, `b${idCounter++}`);
    }
    const elementId = elementIdMap.get(binding.element)!;

    bindings.push({
      id: elementId,
      signalName: binding.signalName,
      type: binding.type as 'style' | 'attr',
      property: binding.property,
      isInsideConditional: false,
      conditionalId: undefined,
    });
  }

  // Third pass: Process event bindings
  for (const binding of parsed.bindings) {
    if (binding.type !== 'event') continue;
    if (!binding.eventName || !binding.handlerExpression) continue;

    const eventId = `e${eventIdCounter++}`;

    // Get or assign element ID for the event target
    if (!elementIdMap.has(binding.element)) {
      elementIdMap.set(binding.element, `b${idCounter++}`);
    }
    const elementId = elementIdMap.get(binding.element)!;

    eventBindings.push({
      id: eventId,
      eventName: binding.eventName,
      modifiers: binding.eventModifiers || [],
      handlerExpression: binding.handlerExpression,
      elementId,
      startIndex: binding.expressionStart,
      endIndex: binding.expressionEnd,
    });
  }

  // Generate the processed HTML output
  const processedContent = generateProcessedHtml(
    templateContent,
    parsed,
    signalInitializers,
    elementIdMap,
    conditionals,
    whenElseBlocks,
    repeatBlocks,
    eventBindings,
    textBindingSpans,
  );

  return {
    processedContent,
    bindings,
    conditionals,
    whenElseBlocks,
    repeatBlocks,
    eventBindings,
    nextId: idCounter,
    hasConditionals: conditionals.length > 0 || whenElseBlocks.length > 0 || repeatBlocks.length > 0,
  };
};

/**
 * Process a conditional element's HTML for the template string
 */
const processConditionalElementHtml = (
  element: HtmlElement,
  originalHtml: string,
  signalInitializers: Map<string, string | number | boolean>,
  elementIdMap: Map<HtmlElement, string>,
  conditionalId: string,
): string => {
  let html = getElementHtml(element, originalHtml);

  // Remove the when directive ("${when(...)}")
  if (element.whenDirective) {
    html = html.replace(element.whenDirective, '');
  }

  // Add ID to the opening tag (right after the tag name)
  const tagNameEnd = element.tagName.length + 1; // +1 for '<'
  html = html.substring(0, tagNameEnd) + ` id="${conditionalId}"` + html.substring(tagNameEnd);

  // Replace signal expressions with initial values
  html = replaceExpressionsWithValues(html, signalInitializers);

  // Add IDs to nested elements that have bindings
  html = addIdsToNestedElements(html, element, elementIdMap, originalHtml);

  // Clean up whitespace
  html = html.replace(/\s+/g, ' ').replace(/\s+>/g, '>').replace(/\s>/g, '>');

  return html;
};

/**
 * Replace ${this.signal()} expressions with their initial values
 */
const replaceExpressionsWithValues = (html: string, signalInitializers: Map<string, string | number | boolean>): string => {
  return html.replace(/\$\{this\.(\w+)\(\)\}/g, (match, signalName) => {
    const value = signalInitializers.get(signalName);
    return value !== undefined ? String(value) : '';
  });
};

/**
 * Process an item template for repeat blocks.
 * Handles ${item} and ${item.property} expressions, adding IDs for reactive updates.
 */
const processItemTemplate = (
  templateContent: string,
  _itemVar: string,
  _indexVar: string | undefined,
  startingId: number,
): {
  processedContent: string;
  bindings: BindingInfo[];
  nextId: number;
} => {
  // For repeat items, we don't add compile-time IDs because:
  // 1. Each item is rendered dynamically at runtime
  // 2. Static IDs would be duplicated across all items
  // 3. Item bindings (${item} or ${item.property}) are interpolated at runtime
  //
  // Future enhancement: Support reactive bindings inside item templates
  // by generating dynamic IDs at runtime

  // Clean up whitespace - collapse all whitespace (including newlines) to single spaces
  // This is critical because newlines inside tags would break HTML parsing
  const result = templateContent
    .replace(/\s+/g, ' ') // Collapse all whitespace to single space
    .replace(/>\s+</g, '><') // Remove whitespace between tags
    .trim();

  return {
    processedContent: result,
    bindings: [],
    nextId: startingId,
  };
};

/**
 * Process a sub-template with full nesting support for when/whenElse
 * Recursively handles nested conditional blocks
 */
const processSubTemplateWithNesting = (
  templateContent: string,
  signalInitializers: Map<string, string | number | boolean>,
  startingId: number,
  parentId: string,
): {
  processedContent: string;
  bindings: BindingInfo[];
  conditionals: ConditionalBlock[];
  whenElseBlocks: WhenElseBlock[];
  nextId: number;
} => {
  const parsed = parseHtmlTemplate(templateContent);
  const bindings: BindingInfo[] = [];
  const conditionals: ConditionalBlock[] = [];
  const whenElseBlocks: WhenElseBlock[] = [];
  let idCounter = startingId;
  const elementIdMap = new Map<HtmlElement, string>();

  // Find conditional elements (those with when directive)
  const conditionalElements = findElementsWithWhenDirective(parsed.roots);
  const conditionalElementSet = new Set(conditionalElements);

  // Track elements inside conditionals
  const elementsInsideConditionals = new Set<HtmlElement>();
  for (const condEl of conditionalElements) {
    walkElements([condEl], (el) => {
      if (el !== condEl) {
        elementsInsideConditionals.add(el);
      }
    });
  }

  // Process when directives (conditional elements)
  for (const condEl of conditionalElements) {
    const whenBinding = parsed.bindings.find((b) => b.element === condEl && b.type === 'when');
    if (!whenBinding || !whenBinding.jsExpression) continue;

    const signalNames = whenBinding.signalNames || [whenBinding.signalName];
    const jsExpression = whenBinding.jsExpression;

    const conditionalId = `b${idCounter++}`;
    elementIdMap.set(condEl, conditionalId);

    // Evaluate initial value
    let evalExpr = jsExpression;
    for (const sigName of signalNames) {
      const initialVal = signalInitializers.get(sigName);
      const sigRegex = new RegExp(`this\\.${sigName}\\(\\)`, 'g');
      evalExpr = evalExpr.replace(sigRegex, JSON.stringify(initialVal ?? false));
    }
    let initialValue = false;
    try {
      initialValue = Boolean(eval(evalExpr));
    } catch (e) {
      // Default to false
    }

    // Get bindings for this element and children
    const condBindings = getBindingsForElement(condEl, parsed.bindings);
    const nestedBindings: BindingInfo[] = [];

    for (const binding of condBindings) {
      if (binding.type === 'when') continue;

      let elementId: string;
      if (binding.element === condEl) {
        elementId = conditionalId;
      } else {
        if (!elementIdMap.has(binding.element)) {
          elementIdMap.set(binding.element, `b${idCounter++}`);
        }
        elementId = elementIdMap.get(binding.element)!;
      }

      nestedBindings.push({
        id: elementId,
        signalName: binding.signalName,
        type: binding.type as 'text' | 'style' | 'attr',
        property: binding.property,
        isInsideConditional: true,
        conditionalId,
      });
    }

    const processedCondHtml = processConditionalElementHtml(condEl, templateContent, signalInitializers, elementIdMap, conditionalId);

    conditionals.push({
      id: conditionalId,
      signalName: signalNames[0],
      signalNames,
      jsExpression,
      initialValue,
      templateContent: processedCondHtml,
      startIndex: condEl.tagStart,
      endIndex: condEl.closeTagEnd,
      nestedBindings,
    });

    bindings.push(...nestedBindings);
  }

  // Process whenElse bindings recursively
  for (const binding of parsed.bindings) {
    if (binding.type !== 'whenElse') continue;
    if (!binding.jsExpression || !binding.thenTemplate || !binding.elseTemplate) continue;

    const signalNames = binding.signalNames || [binding.signalName];
    const jsExpression = binding.jsExpression;

    const thenId = `b${idCounter++}`;
    const elseId = `b${idCounter++}`;

    // Evaluate initial value
    let evalExpr = jsExpression;
    for (const sigName of signalNames) {
      const initialVal = signalInitializers.get(sigName);
      const sigRegex = new RegExp(`this\\.${sigName}\\(\\)`, 'g');
      evalExpr = evalExpr.replace(sigRegex, JSON.stringify(initialVal ?? false));
    }
    let initialValue = false;
    try {
      initialValue = Boolean(eval(evalExpr));
    } catch (e) {
      // Default to false
    }

    // Recursively process nested templates
    const thenProcessed = processSubTemplateWithNesting(binding.thenTemplate, signalInitializers, idCounter, thenId);
    idCounter = thenProcessed.nextId;
    const elseProcessed = processSubTemplateWithNesting(binding.elseTemplate, signalInitializers, idCounter, elseId);
    idCounter = elseProcessed.nextId;

    whenElseBlocks.push({
      thenId,
      elseId,
      signalName: signalNames[0] || '',
      signalNames,
      jsExpression,
      initialValue,
      thenTemplate: thenProcessed.processedContent,
      elseTemplate: elseProcessed.processedContent,
      startIndex: binding.expressionStart,
      endIndex: binding.expressionEnd,
      thenBindings: thenProcessed.bindings,
      elseBindings: elseProcessed.bindings,
      nestedConditionals: [...thenProcessed.conditionals, ...elseProcessed.conditionals],
      nestedWhenElse: [...thenProcessed.whenElseBlocks, ...elseProcessed.whenElseBlocks],
    });
  }

  // Process simple bindings (not inside conditionals)
  for (const binding of parsed.bindings) {
    if (elementsInsideConditionals.has(binding.element)) continue;
    if (conditionalElementSet.has(binding.element)) continue;
    if (binding.type === 'when' || binding.type === 'whenElse') continue;

    if (!elementIdMap.has(binding.element)) {
      elementIdMap.set(binding.element, `b${idCounter++}`);
    }
    const elementId = elementIdMap.get(binding.element)!;

    bindings.push({
      id: elementId,
      signalName: binding.signalName,
      type: binding.type as 'text' | 'style' | 'attr',
      property: binding.property,
      isInsideConditional: true,
      conditionalId: parentId,
    });
  }

  // Generate processed HTML
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  // Replace conditional elements
  for (const cond of conditionals) {
    const replacement = cond.initialValue ? cond.templateContent : `<template id="${cond.id}"></template>`;
    edits.push({ start: cond.startIndex, end: cond.endIndex, replacement });
  }

  // Replace whenElse expressions with two template placeholders
  for (const we of whenElseBlocks) {
    const thenReplacement = we.initialValue ? we.thenTemplate : `<template id="${we.thenId}"></template>`;
    const elseReplacement = we.initialValue ? `<template id="${we.elseId}"></template>` : we.elseTemplate;
    // Insert both as adjacent elements
    edits.push({ start: we.startIndex, end: we.endIndex, replacement: thenReplacement + elseReplacement });
  }

  // Replace expressions with initial values (not in conditional ranges)
  const conditionalRanges = conditionals.map((c) => ({ start: c.startIndex, end: c.endIndex }));
  const whenElseRanges = whenElseBlocks.map((w) => ({ start: w.startIndex, end: w.endIndex }));
  const allRanges = [...conditionalRanges, ...whenElseRanges];

  const exprRegex = /\$\{this\.(\w+)\(\)\}/g;
  let match: RegExpExecArray | null;
  while ((match = exprRegex.exec(templateContent)) !== null) {
    const exprStart = match.index;
    const exprEnd = exprStart + match[0].length;
    const insideRange = allRanges.some((r) => exprStart >= r.start && exprStart < r.end);
    if (insideRange) continue;

    const signalName = match[1];
    const value = signalInitializers.get(signalName);
    const replacement = value !== undefined ? String(value) : '';
    edits.push({ start: exprStart, end: exprEnd, replacement });
  }

  // Add IDs to elements (not in conditional ranges)
  for (const [element, id] of elementIdMap) {
    const insideRange = allRanges.some((r) => element.tagStart >= r.start && element.tagStart < r.end);
    if (insideRange) continue;
    if (element.attributes.has('id')) continue;
    edits.push({ start: element.tagNameEnd, end: element.tagNameEnd, replacement: ` id="${id}"` });
  }

  // Apply edits in reverse order
  edits.sort((a, b) => b.start - a.start);
  let result = templateContent;
  for (const edit of edits) {
    result = result.substring(0, edit.start) + edit.replacement + result.substring(edit.end);
  }

  result = result.replace(/\s+/g, ' ').trim();

  return {
    processedContent: result,
    bindings,
    conditionals,
    whenElseBlocks,
    nextId: idCounter,
  };
};

/**
 * Add IDs to nested elements that need them (those with bindings)
 */
const addIdsToNestedElements = (processedHtml: string, rootElement: HtmlElement, elementIdMap: Map<HtmlElement, string>, _originalHtml: string): string => {
  let result = processedHtml;

  // Walk the original element tree and add IDs where needed
  walkElements([rootElement], (el) => {
    if (el === rootElement) return; // Root already has ID

    const id = elementIdMap.get(el);
    if (!id) return; // No ID needed for this element

    // Find this element in the processed HTML by reconstructing a unique pattern
    // Use the tag name and any existing attributes to find it
    const existingAttrs: string[] = [];
    for (const [name, attr] of el.attributes) {
      // Use the processed attribute value (with expressions replaced)
      const processedValue = replaceExpressionsWithValues(attr.value, new Map());
      existingAttrs.push(`${name}="${processedValue}"`);
    }

    // Build a pattern to match this element's opening tag
    // This is a best-effort approach - complex cases might not match perfectly
    const tagPattern = new RegExp(`<${el.tagName}(\\s+[^>]*)?(?<!id="[^"]*")>`, 'g');

    // Try to add id if not present
    result = result.replace(tagPattern, (match) => {
      if (match.includes(`id="`)) return match; // Already has an ID
      // Add ID after tag name
      return match.replace(`<${el.tagName}`, `<${el.tagName} id="${id}"`);
    });
  });

  return result;
};

/**
 * Inject an ID into the first HTML element of a template string
 * E.g., "<div>Hello</div>" with id "b0" becomes "<div id="b0">Hello</div>"
 */
const injectIdIntoFirstElement = (html: string, id: string): string => {
  // Match the first opening tag and inject id after the tag name
  return html.replace(/^(\s*<[a-zA-Z][a-zA-Z0-9-]*)(\s|>)/, `$1 id="${id}"$2`);
};

/**
 * Generate the final processed HTML output
 */
const generateProcessedHtml = (
  originalHtml: string,
  parsed: ParsedTemplate,
  signalInitializers: Map<string, string | number | boolean>,
  elementIdMap: Map<HtmlElement, string>,
  conditionals: ConditionalBlock[],
  whenElseBlocks: WhenElseBlock[] = [],
  repeatBlocks: RepeatBlock[] = [],
  eventBindings: EventBinding[] = [],
  textBindingSpans: Map<number, string> = new Map(),
): string => {
  // Build list of edits to apply
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  // Build map of element -> event bindings for data attribute injection
  const elementEventMap = new Map<HtmlElement, EventBinding[]>();
  for (const evt of eventBindings) {
    // Find the element with this binding
    for (const [element, id] of elementIdMap) {
      if (id === evt.elementId) {
        if (!elementEventMap.has(element)) {
          elementEventMap.set(element, []);
        }
        elementEventMap.get(element)!.push(evt);
        break;
      }
    }
  }

  // Replace conditional elements with their processed versions or templates
  for (const cond of conditionals) {
    const replacement = cond.initialValue ? cond.templateContent : `<template id="${cond.id}"></template>`;
    edits.push({
      start: cond.startIndex,
      end: cond.endIndex,
      replacement,
    });
  }

  // Replace whenElse expressions with two adjacent template placeholders
  for (const we of whenElseBlocks) {
    // For whenElse, we create two adjacent elements that toggle inversely
    // This allows reuse of __bindIfExpr for both cases
    // When showing actual template content, inject the ID into the first element
    const thenReplacement = we.initialValue ? injectIdIntoFirstElement(we.thenTemplate, we.thenId) : `<template id="${we.thenId}"></template>`;
    const elseReplacement = we.initialValue ? `<template id="${we.elseId}"></template>` : injectIdIntoFirstElement(we.elseTemplate, we.elseId);
    edits.push({
      start: we.startIndex,
      end: we.endIndex,
      replacement: thenReplacement + elseReplacement,
    });
  }

  // Replace repeat expressions with anchor template elements
  for (const rep of repeatBlocks) {
    // Use a template element as an anchor point for list insertion
    const replacement = `<template id="${rep.id}"></template>`;
    edits.push({
      start: rep.startIndex,
      end: rep.endIndex,
      replacement,
    });
  }

  // Replace expressions in non-conditional parts
  const conditionalRanges = conditionals.map((c) => ({ start: c.startIndex, end: c.endIndex }));
  const whenElseRanges = whenElseBlocks.map((w) => ({ start: w.startIndex, end: w.endIndex }));
  const repeatRanges = repeatBlocks.map((r) => ({ start: r.startIndex, end: r.endIndex }));
  const allRanges = [...conditionalRanges, ...whenElseRanges, ...repeatRanges];

  const exprRegex = /\$\{this\.(\w+)\(\)\}/g;
  let match: RegExpExecArray | null;

  while ((match = exprRegex.exec(originalHtml)) !== null) {
    const exprStart = match.index;
    const exprEnd = exprStart + match[0].length;

    // Skip if inside a conditional, whenElse, or repeat range
    const insideRange = allRanges.some((r) => exprStart >= r.start && exprStart < r.end);
    if (insideRange) continue;

    const signalName = match[1];
    const value = signalInitializers.get(signalName);
    const valueStr = value !== undefined ? String(value) : '';

    // Check if this is a text binding that should be wrapped in a span
    const spanId = textBindingSpans.get(exprStart);
    let replacement: string;
    if (spanId) {
      // Wrap in a span for precise text updates
      replacement = `<span id="${spanId}">${valueStr}</span>`;
    } else {
      // Direct replacement (for style/attr bindings in attribute values)
      replacement = valueStr;
    }

    edits.push({ start: exprStart, end: exprEnd, replacement });
  }

  // Remove @event attributes and prepare data-evt attributes for injection
  // We'll track which elements need which data-evt-{type} attributes
  const elementDataAttrs = new Map<HtmlElement, string[]>();

  for (const binding of parsed.bindings) {
    if (binding.type === 'event' && binding.eventName) {
      // Find the corresponding EventBinding to get the handler ID
      const eventBinding = eventBindings.find((eb) => eb.eventName === binding.eventName && eb.startIndex === binding.expressionStart);
      if (eventBinding) {
        // Remove the @event="..." attribute from the HTML
        edits.push({
          start: binding.expressionStart,
          end: binding.expressionEnd,
          replacement: '',
        });

        // Build the data attribute value: "e0" or "e0:stop:prevent" with modifiers
        const attrValue = eventBinding.modifiers.length > 0 ? `${eventBinding.id}:${eventBinding.modifiers.join(':')}` : eventBinding.id;

        // Track data-evt-{type}="{id}:{modifiers}" attribute to add
        if (!elementDataAttrs.has(binding.element)) {
          elementDataAttrs.set(binding.element, []);
        }
        elementDataAttrs.get(binding.element)!.push(`data-evt-${binding.eventName}="${attrValue}"`);
      }
    }
  }

  // Add IDs and event data attributes to elements that need them (not inside conditionals, whenElse, or repeat)
  for (const [element, id] of elementIdMap) {
    // Skip elements that are inside ranges
    const insideRange = allRanges.some((r) => element.tagStart >= r.start && element.tagStart < r.end);
    if (insideRange) continue;

    // Build the attributes to inject
    const attrsToAdd: string[] = [];

    // Add ID if element doesn't already have one
    if (!element.attributes.has('id')) {
      attrsToAdd.push(`id="${id}"`);
    }

    // Add any event data attributes for this element
    const dataAttrs = elementDataAttrs.get(element);
    if (dataAttrs) {
      attrsToAdd.push(...dataAttrs);
    }

    if (attrsToAdd.length > 0) {
      edits.push({
        start: element.tagNameEnd,
        end: element.tagNameEnd,
        replacement: ' ' + attrsToAdd.join(' '),
      });
    }
  }

  // Apply edits in reverse order
  edits.sort((a, b) => b.start - a.start);

  let result = originalHtml;
  for (const edit of edits) {
    result = result.substring(0, edit.start) + edit.replacement + result.substring(edit.end);
  }

  // Clean up whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
};

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generate a single update statement for a binding (no subscribe wrapper)
 * Returns the code that goes inside the subscription callback
 */
const generateBindingUpdateCode = (binding: BindingInfo): string => {
  const elRef = binding.id;

  if (binding.type === 'style') {
    const prop = toCamelCase(binding.property!);
    return `${elRef}.style.${prop} = v`;
  } else if (binding.type === 'attr') {
    return `${elRef}.setAttribute('${binding.property}', v)`;
  } else {
    // Text binding: update span's textContent
    return `${elRef}.textContent = v`;
  }
};

/**
 * Generate initial value assignment for a binding (no subscription)
 * This sets the DOM value directly without going through subscribe
 */
const generateInitialValueCode = (binding: BindingInfo): string => {
  const elRef = binding.id;
  const signalCall = `this.${binding.signalName}()`;

  if (binding.type === 'style') {
    const prop = toCamelCase(binding.property!);
    return `${elRef}.style.${prop} = ${signalCall}`;
  } else if (binding.type === 'attr') {
    return `${elRef}.setAttribute('${binding.property}', ${signalCall})`;
  } else {
    // Text binding: update span's textContent
    return `${elRef}.textContent = ${signalCall}`;
  }
};

/**
 * Group bindings by signal name for consolidated subscriptions
 */
const groupBindingsBySignal = (bindings: BindingInfo[]): Map<string, BindingInfo[]> => {
  const groups = new Map<string, BindingInfo[]>();
  for (const binding of bindings) {
    const existing = groups.get(binding.signalName) || [];
    existing.push(binding);
    groups.set(binding.signalName, existing);
  }
  return groups;
};

/**
 * Generate consolidated subscription code for a group of bindings to the same signal
 * Uses skipInitial=true since initial values are set directly
 */
const generateConsolidatedSubscription = (signalName: string, bindings: BindingInfo[]): string => {
  if (bindings.length === 1) {
    // Single binding - use compact inline form with skipInitial
    const update = generateBindingUpdateCode(bindings[0]);
    return `this.${signalName}.subscribe(v => { ${update}; }, true)`;
  }

  // Multiple bindings - consolidate into single subscription with skipInitial
  const updates = bindings.map((b) => `      ${generateBindingUpdateCode(b)};`).join('\n');
  return `this.${signalName}.subscribe(v => {\n${updates}\n    }, true)`;
};

/**
 * Generate the complete initializeBindings function with cached refs and conditionals
 * Optimized: sets initial values directly, then subscribes with skipInitial
 */
const generateInitBindingsFunction = (
  bindings: BindingInfo[],
  conditionals: ConditionalBlock[],
  whenElseBlocks: WhenElseBlock[] = [],
  repeatBlocks: RepeatBlock[] = [],
  eventBindings: EventBinding[] = [],
): string => {
  const lines: string[] = [];
  lines.push('  initializeBindings = () => {');
  lines.push('    const r = this.shadowRoot;');

  // Group top-level bindings (not inside any conditional)
  const topLevelBindings = bindings.filter((b) => !b.isInsideConditional);

  // Get unique element IDs for caching
  const topLevelIds = [...new Set(topLevelBindings.map((b) => b.id))];

  // Cache refs for top-level elements
  if (topLevelIds.length > 0) {
    for (const id of topLevelIds) {
      lines.push(`    const ${id} = r.getElementById('${id}');`);
    }
  }

  // Set initial values directly (no subscription overhead)
  for (const binding of topLevelBindings) {
    lines.push(`    ${generateInitialValueCode(binding)};`);
  }

  // Group bindings by signal and generate consolidated subscriptions (skipInitial)
  const signalGroups = groupBindingsBySignal(topLevelBindings);
  for (const [signalName, signalBindings] of signalGroups) {
    lines.push(`    ${generateConsolidatedSubscription(signalName, signalBindings)};`);
  }

  // Generate conditional bindings
  for (const cond of conditionals) {
    const nestedBindings = cond.nestedBindings;
    const escapedTemplate = cond.templateContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    // Generate nested bindings initializer with consolidated subscriptions
    let nestedCode = '() => []';
    if (nestedBindings.length > 0) {
      const nestedIds = [...new Set(nestedBindings.map((b) => b.id))];
      const nestedLines: string[] = [];
      nestedLines.push('() => {');

      // Cache refs for nested elements
      for (const id of nestedIds) {
        nestedLines.push(`      const ${id} = r.getElementById('${id}');`);
      }

      // Set initial values for nested bindings
      for (const binding of nestedBindings) {
        nestedLines.push(`      ${generateInitialValueCode(binding)};`);
      }

      // Group nested bindings by signal and generate consolidated subscriptions
      const nestedSignalGroups = groupBindingsBySignal(nestedBindings);
      nestedLines.push('      return [');
      for (const [signalName, signalBindings] of nestedSignalGroups) {
        nestedLines.push(`        ${generateConsolidatedSubscription(signalName, signalBindings)},`);
      }
      nestedLines.push('      ];');
      nestedLines.push('    }');
      nestedCode = nestedLines.join('\n');
    }

    // Check if this is a simple single-signal expression or a complex one
    const isSimpleExpr = cond.signalNames.length === 1 && cond.jsExpression === `this.${cond.signalName}()`;

    if (isSimpleExpr) {
      // Simple case: use __bindIf with the signal directly
      lines.push(`    ${BIND_FN.IF}(r, this.${cond.signalName}, '${cond.id}', \`${escapedTemplate}\`, ${nestedCode});`);
    } else {
      // Complex case: use __bindIfExpr with signals array and evaluator function
      const signalsArray = cond.signalNames.map((s) => `this.${s}`).join(', ');
      lines.push(`    ${BIND_FN.IF_EXPR}(r, [${signalsArray}], () => ${cond.jsExpression}, '${cond.id}', \`${escapedTemplate}\`, ${nestedCode});`);
    }
  }

  // Generate whenElse bindings as two __bindIfExpr calls
  for (const we of whenElseBlocks) {
    // Inject IDs into templates - the root element of each template needs the ID
    const thenTemplateWithId = injectIdIntoFirstElement(we.thenTemplate, we.thenId);
    const elseTemplateWithId = injectIdIntoFirstElement(we.elseTemplate, we.elseId);
    const escapedThenTemplate = thenTemplateWithId.replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const escapedElseTemplate = elseTemplateWithId.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    // Helper to generate nested binding initializer code
    const generateNestedInitializer = (bindings: BindingInfo[], nestedConds: ConditionalBlock[], nestedWE: WhenElseBlock[]): string => {
      if (bindings.length === 0 && nestedConds.length === 0 && nestedWE.length === 0) {
        return '() => []';
      }

      const initLines: string[] = [];
      initLines.push('() => {');

      // Cache refs for elements with simple bindings
      const ids = [...new Set(bindings.map((b) => b.id))];
      for (const id of ids) {
        initLines.push(`      const ${id} = r.getElementById('${id}');`);
      }

      // Set initial values for bindings
      for (const binding of bindings) {
        initLines.push(`      ${generateInitialValueCode(binding)};`);
      }

      initLines.push('      return [');

      // Generate subscriptions for simple bindings
      const signalGroups = groupBindingsBySignal(bindings);
      for (const [signalName, signalBindings] of signalGroups) {
        initLines.push(`        ${generateConsolidatedSubscription(signalName, signalBindings)},`);
      }

      // Generate nested conditional bindings
      for (const cond of nestedConds) {
        const nestedEscapedTemplate = cond.templateContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const nestedBindingsCode = generateNestedInitializer(cond.nestedBindings, [], []);
        const isSimple = cond.signalNames.length === 1 && cond.jsExpression === `this.${cond.signalName}()`;
        if (isSimple) {
          initLines.push(`        ${BIND_FN.IF}(r, this.${cond.signalName}, '${cond.id}', \`${nestedEscapedTemplate}\`, ${nestedBindingsCode}),`);
        } else {
          const signalsArray = cond.signalNames.map((s) => `this.${s}`).join(', ');
          initLines.push(`        ${BIND_FN.IF_EXPR}(r, [${signalsArray}], () => ${cond.jsExpression}, '${cond.id}', \`${nestedEscapedTemplate}\`, ${nestedBindingsCode}),`);
        }
      }

      // Generate nested whenElse bindings (recursive)
      for (const nestedWe of nestedWE) {
        // Inject IDs into nested templates
        const nestedThenWithId = injectIdIntoFirstElement(nestedWe.thenTemplate, nestedWe.thenId);
        const nestedElseWithId = injectIdIntoFirstElement(nestedWe.elseTemplate, nestedWe.elseId);
        const nestedThenTemplate = nestedThenWithId.replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const nestedElseTemplate = nestedElseWithId.replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const thenInitCode = generateNestedInitializer(
          nestedWe.thenBindings,
          nestedWe.nestedConditionals.filter((c) => nestedWe.thenBindings.some((b) => b.conditionalId === c.id) || true),
          nestedWe.nestedWhenElse,
        );
        const elseInitCode = generateNestedInitializer(nestedWe.elseBindings, [], []);
        const signalsArray = nestedWe.signalNames.map((s) => `this.${s}`).join(', ');
        // Then case
        initLines.push(`        ${BIND_FN.IF_EXPR}(r, [${signalsArray}], () => ${nestedWe.jsExpression}, '${nestedWe.thenId}', \`${nestedThenTemplate}\`, ${thenInitCode}),`);
        // Else case (inverted condition)
        initLines.push(`        ${BIND_FN.IF_EXPR}(r, [${signalsArray}], () => !(${nestedWe.jsExpression}), '${nestedWe.elseId}', \`${nestedElseTemplate}\`, ${elseInitCode}),`);
      }

      initLines.push('      ];');
      initLines.push('    }');
      return initLines.join('\n');
    };

    // Generate then bindings initializer (with nested support)
    const thenCode = generateNestedInitializer(we.thenBindings, we.nestedConditionals, we.nestedWhenElse);

    // Generate else bindings initializer
    const elseCode = generateNestedInitializer(we.elseBindings, [], []);

    const signalsArray = we.signalNames.map((s) => `this.${s}`).join(', ');
    // Generate two __bindIfExpr calls - one for then (condition true), one for else (condition false)
    lines.push(`    ${BIND_FN.IF_EXPR}(r, [${signalsArray}], () => ${we.jsExpression}, '${we.thenId}', \`${escapedThenTemplate}\`, ${thenCode});`);
    lines.push(`    ${BIND_FN.IF_EXPR}(r, [${signalsArray}], () => !(${we.jsExpression}), '${we.elseId}', \`${escapedElseTemplate}\`, ${elseCode});`);
  }

  // Generate repeat bindings
  for (const rep of repeatBlocks) {
    // Escape backticks and newlines - we need ${itemVar} to remain as template interpolation
    // but newlines must become \n to prevent breaking HTML tags across lines
    const escapedItemTemplate = rep.itemTemplate
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/`/g, '\\`') // Escape backticks
      .replace(/\n/g, '\\n') // Escape newlines
      .replace(/\r/g, '\\r'); // Escape carriage returns

    // Generate the template function that produces HTML for each item
    // The ${itemVar} expressions will be interpolated at runtime
    const templateFnParams = rep.indexVar ? `${rep.itemVar}, ${rep.indexVar}` : rep.itemVar;
    const templateFn = `(${templateFnParams}) => \`${escapedItemTemplate}\``;

    // Generate the binding initializer function for each item
    // This handles reactive bindings within each item template
    // Now receives array of elements for fragment support
    const initItemBindingsFn = `(els, ${templateFnParams}) => []`; // For now, just return empty array

    // Build the __bindRepeat call with optional emptyTemplate and trackBy
    let bindRepeatCall = `${BIND_FN.REPEAT}(r, this.${rep.signalName}, '${rep.id}', ${templateFn}, ${initItemBindingsFn}`;

    // Add emptyTemplate (or undefined if not provided but trackBy is)
    if (rep.emptyTemplate) {
      const escapedEmptyTemplate = rep.emptyTemplate.replace(/`/g, '\\`');
      bindRepeatCall += `, \`${escapedEmptyTemplate}\``;
    } else if (rep.trackByFn) {
      // Need to pass undefined for emptyTemplate if trackBy is provided
      bindRepeatCall += `, undefined`;
    }

    // Add trackBy options if provided
    if (rep.trackByFn) {
      bindRepeatCall += `, { trackBy: ${rep.trackByFn} }`;
    }

    bindRepeatCall += ')';

    lines.push(`    ${bindRepeatCall};`);
  }

  // Generate event delegation setup
  if (eventBindings.length > 0) {
    // Group event bindings by event type
    const eventsByType = new Map<string, EventBinding[]>();
    for (const evt of eventBindings) {
      if (!eventsByType.has(evt.eventName)) {
        eventsByType.set(evt.eventName, []);
      }
      eventsByType.get(evt.eventName)!.push(evt);
    }

    // Build the event map object
    const eventMapLines: string[] = [];
    for (const [eventType, handlers] of eventsByType) {
      const handlerEntries = handlers.map((h) => {
        // Wrap handler expression to ensure 'this' context is preserved
        // For method references like 'this._handleClick', wrap in arrow function
        // For arrow functions like '(e) => this._method(e)', use as-is
        let handlerCode = h.handlerExpression;
        // Check if it's a simple method reference (this.methodName or this._methodName)
        if (/^this\.\w+$/.test(handlerCode)) {
          // It's a method reference - wrap in arrow to preserve 'this' and pass event
          handlerCode = `(e) => ${handlerCode}.call(this, e)`;
        } else if (/^this\._?\w+$/.test(handlerCode)) {
          // It's a method reference (with underscore) - wrap in arrow to preserve 'this' and pass event
          handlerCode = `(e) => ${handlerCode}.call(this, e)`;
        }
        // If it's already an arrow function, use as-is (it should have proper 'this' binding)
        return `'${h.id}': ${handlerCode}`;
      });
      eventMapLines.push(`      ${eventType}: { ${handlerEntries.join(', ')} }`);
    }

    lines.push(`    ${BIND_FN.EVENTS}(r, {`);
    lines.push(eventMapLines.join(',\n'));
    lines.push('    });');
  }

  lines.push('  };');

  return '\n\n' + lines.join('\n');
};

/**
 * Generate static template code
 */
const generateStaticTemplate = (content: string): string => {
  const escapedContent = content.replace(/`/g, '\\`');
  return `
  static template = (() => {
    const t = document.createElement('template');
    t.innerHTML = \`${escapedContent}\`;
    return t;
  })();`;
};

/**
 * Generate updated import statement with binding functions
 */
const generateUpdatedImport = (importInfo: ImportInfo, requiredBindFunctions: string[]): string => {
  const allImports = [...importInfo.namedImports, ...requiredBindFunctions];
  return `import { ${allImports.join(', ')} } from ${importInfo.quoteChar}${importInfo.moduleSpecifier}${importInfo.quoteChar}`;
};

// ============================================================================
// Source Transformation
// ============================================================================

/**
 * Process the source file and return transformed source.
 */
const transformComponentSource = (source: string, filePath: string): string | null => {
  const sourceFile = sourceCache.parse(filePath, source);
  const componentClass = findComponentClass(sourceFile);
  if (!componentClass) {
    return null;
  }

  const signalInitializers = findSignalInitializers(sourceFile);
  const servicesImport = findServicesImport(sourceFile);
  const htmlTemplates = findHtmlTemplates(sourceFile);

  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  let allBindings: BindingInfo[] = [];
  let allConditionals: ConditionalBlock[] = [];
  let allWhenElseBlocks: WhenElseBlock[] = [];
  let allRepeatBlocks: RepeatBlock[] = [];
  let allEventBindings: EventBinding[] = [];
  let idCounter = 0;
  let lastProcessedTemplateContent = '';
  let hasConditionals = false;

  for (const templateInfo of htmlTemplates) {
    let templateContent = extractTemplateContent(templateInfo.node.template, sourceFile);

    const result = processHtmlTemplateWithConditionals(templateContent, signalInitializers, idCounter);
    templateContent = result.processedContent;
    allBindings = [...allBindings, ...result.bindings];
    allConditionals = [...allConditionals, ...result.conditionals];
    allWhenElseBlocks = [...allWhenElseBlocks, ...result.whenElseBlocks];
    allRepeatBlocks = [...allRepeatBlocks, ...result.repeatBlocks];
    allEventBindings = [...allEventBindings, ...result.eventBindings];
    idCounter = result.nextId;
    hasConditionals = hasConditionals || result.hasConditionals;

    lastProcessedTemplateContent = templateContent;

    edits.push({
      start: templateInfo.templateStart,
      end: templateInfo.templateEnd,
      replacement: '``',
    });
  }

  // Process css template literals
  const visitCss = (node: ts.Node) => {
    if (ts.isTaggedTemplateExpression(node) && isCssTemplate(node)) {
      const cssContent = extractTemplateContent(node.template, sourceFile);
      edits.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        replacement: '`' + cssContent + '`',
      });
    }
    ts.forEachChild(node, visitCss);
  };
  visitCss(sourceFile);

  // Generate code to inject
  const initBindingsFunction = generateInitBindingsFunction(allBindings, allConditionals, allWhenElseBlocks, allRepeatBlocks, allEventBindings);

  let staticTemplateCode = '';
  if (lastProcessedTemplateContent) {
    staticTemplateCode = generateStaticTemplate(lastProcessedTemplateContent);
  }

  // Find class body start position for injection
  let classBodyStart: number | null = null;
  const classStart = componentClass.getStart(sourceFile);
  const classText = componentClass.getText(sourceFile);
  const braceIndex = classText.indexOf('{');
  if (braceIndex !== -1) {
    classBodyStart = classStart + braceIndex + 1;
  }

  // Update import if we have bindings
  const hasAnyBindings = allBindings.length > 0 || allConditionals.length > 0 || allWhenElseBlocks.length > 0 || allRepeatBlocks.length > 0 || allEventBindings.length > 0;
  if (hasAnyBindings && servicesImport) {
    const requiredFunctions: string[] = [];
    if (allBindings.some((b) => b.type === 'style')) requiredFunctions.push(BIND_FN.STYLE);
    if (allBindings.some((b) => b.type === 'attr')) requiredFunctions.push(BIND_FN.ATTR);
    if (allBindings.some((b) => b.type === 'text')) requiredFunctions.push(BIND_FN.TEXT);

    // Check if we need simple __bindIf or complex __bindIfExpr
    const hasSimpleConditionals = allConditionals.some((c) => c.signalNames.length === 1 && c.jsExpression === `this.${c.signalName}()`);
    const hasComplexConditionals = allConditionals.some((c) => c.signalNames.length > 1 || c.jsExpression !== `this.${c.signalName}()`);

    if (hasSimpleConditionals) requiredFunctions.push(BIND_FN.IF);
    // whenElse now compiles to two __bindIfExpr calls, so it needs IF_EXPR
    if (hasComplexConditionals || allWhenElseBlocks.length > 0) requiredFunctions.push(BIND_FN.IF_EXPR);
    // Add __bindRepeat if there are repeat blocks
    if (allRepeatBlocks.length > 0) requiredFunctions.push(BIND_FN.REPEAT);
    // Add __setupEventDelegation if there are event bindings
    if (allEventBindings.length > 0) requiredFunctions.push(BIND_FN.EVENTS);

    if (requiredFunctions.length > 0) {
      const newImport = generateUpdatedImport(servicesImport, requiredFunctions);
      edits.push({
        start: servicesImport.start,
        end: servicesImport.end,
        replacement: newImport,
      });
    }
  }

  let result = applyEdits(source, edits);

  if (classBodyStart !== null) {
    const injectedCode = staticTemplateCode + initBindingsFunction;
    result = result.replace(/class\s+extends\s+Component\s*\{/, (match) => {
      return match + injectedCode;
    });
  }

  return result;
};

// ============================================================================
// Plugin Export
// ============================================================================

/**
 * Reactive Binding Plugin - Compiles signal bindings and conditionals at build time
 */
export const ReactiveBindingPlugin: Plugin = {
  name: NAME,
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      if (args.path.includes('scripts') || args.path.includes('node_modules')) {
        return undefined;
      }

      const source = await fs.promises.readFile(args.path, 'utf8');

      if (!extendsComponent(source) || !hasHtmlTemplates(source)) {
        return undefined;
      }

      try {
        const transformed = transformComponentSource(source, args.path);

        if (transformed === null) {
          return undefined;
        }

        return createLoaderResult(transformed);
      } catch (error) {
        logger.error(NAME, `Error processing ${args.path}`, error);
        return undefined;
      }
    });
  },
};
