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
  nestedBindings: BindingInfo[]; // Signal bindings inside this conditional
  nestedItemBindings: ItemBinding[]; // Item bindings inside this conditional (for conditionals inside repeats)
  nestedConditionals: ConditionalBlock[]; // Nested when blocks inside this conditional
  nestedEventBindings: EventBinding[]; // Event bindings inside this conditional
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
  itemTemplate: string; // HTML template for each item (processed)
  emptyTemplate?: string; // HTML template shown when list is empty
  trackByFn?: string; // Custom trackBy function source (deprecated - no longer used)
  startIndex: number; // Position in HTML where ${repeat starts
  endIndex: number; // Position after }
  // Item-specific bindings (expressions using item/index variables)
  itemBindings: ItemBinding[]; // Bindings inside item template that reference item/index
  itemEvents: ItemEventBinding[]; // Event handlers inside item template
  // Component-level signal bindings inside the repeat template
  signalBindings: BindingInfo[]; // Signal bindings like ${this._class()}
  eventBindings: EventBinding[]; // Event bindings not involving item
  // Nested structures (recursive)
  nestedConditionals: ConditionalBlock[];
  nestedWhenElse: WhenElseBlock[];
  nestedRepeats: RepeatBlock[];
}

/** Binding info for item template expressions */
interface ItemBinding {
  elementId: string; // ID assigned to the element (e.g., 'i0', 'i1')
  type: 'text' | 'attr' | 'style'; // Type of binding
  property?: string; // For attr/style: the property name
  expression: string; // The JS expression (e.g., 'item.label', 'item.count > 0')
}

/** Event binding info for events inside repeat item templates */
interface ItemEventBinding {
  eventId: string; // Unique ID for this event handler (e.g., 'ie0', 'ie1')
  eventName: string; // Event type (e.g., 'click', 'mouseenter')
  modifiers: string[]; // Event modifiers (e.g., ['stop', 'prevent'])
  handlerExpression: string; // The handler code with item/index references
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
  const eventIdCounter = { value: 0 };

  // Track which elements need IDs and what ID they get
  const elementIdMap = new Map<HtmlElement, string>();

  // Find all conditional elements (those with when directive)
  const allConditionalElements = findElementsWithWhenDirective(parsed.roots);
  const conditionalElementSet = new Set(allConditionalElements);

  // Create a set of all elements that are inside conditionals (for filtering)
  const elementsInsideConditionals = new Set<HtmlElement>();
  for (const condEl of allConditionalElements) {
    walkElements([condEl], (el) => {
      if (el !== condEl) {
        elementsInsideConditionals.add(el);
      }
    });
  }

  // Identify top-level conditionals (not nested inside other conditionals)
  const topLevelConditionalElements = allConditionalElements.filter((el) => !elementsInsideConditionals.has(el));

  // Map to track which conditional element contains which nested conditionals
  const nestedConditionalsMap = new Map<HtmlElement, HtmlElement[]>();
  for (const condEl of topLevelConditionalElements) {
    const nested: HtmlElement[] = [];
    walkElements([condEl], (el) => {
      if (el !== condEl && conditionalElementSet.has(el)) {
        nested.push(el);
      }
    });
    nestedConditionalsMap.set(condEl, nested);
  }

  // First pass: Process TOP-LEVEL conditionals and assign IDs
  for (const condEl of topLevelConditionalElements) {
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
      // Skip the 'when' binding itself
      if (binding.type === 'when') continue;

      // Skip event bindings - they're handled by processConditionalElementHtml
      if (binding.type === 'event') continue;

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

      nestedBindings.push({
        id: elementId,
        signalName: binding.signalName,
        type: binding.type as 'text' | 'style' | 'attr',
        property: binding.property,
        isInsideConditional: true,
        conditionalId,
      });
    }

    // Process nested conditionals (when inside when)
    const nestedCondElements = nestedConditionalsMap.get(condEl) || [];
    const nestedConditionals: ConditionalBlock[] = [];

    for (const nestedCondEl of nestedCondElements) {
      const nestedWhenBinding = parsed.bindings.find((b) => b.element === nestedCondEl && b.type === 'when');
      if (!nestedWhenBinding || !nestedWhenBinding.jsExpression) continue;

      const nestedSignalNames = nestedWhenBinding.signalNames || [nestedWhenBinding.signalName];
      const nestedJsExpression = nestedWhenBinding.jsExpression;
      const nestedCondId = `b${idCounter++}`;
      elementIdMap.set(nestedCondEl, nestedCondId);

      // Evaluate initial value for nested conditional
      let nestedEvalExpr = nestedJsExpression;
      for (const sigName of nestedSignalNames) {
        const initialVal = signalInitializers.get(sigName);
        const sigRegex = new RegExp(`this\\.${sigName}\\(\\)`, 'g');
        nestedEvalExpr = nestedEvalExpr.replace(sigRegex, JSON.stringify(initialVal ?? false));
      }
      let nestedInitialValue = false;
      try {
        nestedInitialValue = Boolean(eval(nestedEvalExpr));
      } catch (e) {}

      // Get bindings for nested conditional
      const nestedCondBindings = getBindingsForElement(nestedCondEl, parsed.bindings);
      const nestedNestedBindings: BindingInfo[] = [];

      for (const binding of nestedCondBindings) {
        if (binding.type === 'when') continue;
        // Skip event bindings - they're handled by processConditionalElementHtml
        if (binding.type === 'event') continue;

        let nestedElementId: string;
        if (binding.element === nestedCondEl) {
          nestedElementId = nestedCondId;
        } else {
          if (!elementIdMap.has(binding.element)) {
            elementIdMap.set(binding.element, `b${idCounter++}`);
          }
          nestedElementId = elementIdMap.get(binding.element)!;
        }

        nestedNestedBindings.push({
          id: nestedElementId,
          signalName: binding.signalName,
          type: binding.type as 'text' | 'style' | 'attr',
          property: binding.property,
          isInsideConditional: true,
          conditionalId: nestedCondId,
        });
      }

      const nestedProcessedResult = processConditionalElementHtml(nestedCondEl, templateContent, signalInitializers, elementIdMap, nestedCondId, undefined, eventIdCounter);

      nestedConditionals.push({
        id: nestedCondId,
        signalName: nestedSignalNames[0],
        signalNames: nestedSignalNames,
        jsExpression: nestedJsExpression,
        initialValue: nestedInitialValue,
        templateContent: nestedProcessedResult.html,
        startIndex: nestedCondEl.tagStart,
        endIndex: nestedCondEl.closeTagEnd,
        nestedBindings: nestedNestedBindings,
        nestedItemBindings: [],
        nestedConditionals: [], // TODO: Support deeper nesting if needed
        nestedEventBindings: nestedProcessedResult.eventBindings,
      });
    }

    // Generate the processed HTML for this conditional element
    // Pass nestedConditionals so nested when elements are replaced with template anchors
    const processedCondResult = processConditionalElementHtml(condEl, templateContent, signalInitializers, elementIdMap, conditionalId, nestedConditionals, eventIdCounter);

    conditionals.push({
      id: conditionalId,
      signalName: signalNames[0], // Primary signal for backwards compatibility
      signalNames,
      jsExpression,
      initialValue,
      templateContent: processedCondResult.html,
      startIndex: condEl.tagStart,
      endIndex: condEl.closeTagEnd,
      nestedBindings,
      nestedItemBindings: [],
      nestedConditionals,
      nestedEventBindings: processedCondResult.eventBindings,
    });

    bindings.push(...nestedBindings);
    eventBindings.push(...processedCondResult.eventBindings);
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

  // First pass: identify all repeat bindings and their ranges
  // This helps us identify which repeats are nested inside other repeats
  const allRepeatRanges: Array<{ start: number; end: number }> = [];
  for (const binding of parsed.bindings) {
    if (binding.type === 'repeat') {
      allRepeatRanges.push({ start: binding.expressionStart, end: binding.expressionEnd });
    }
  }

  // Helper to check if a position is inside any other repeat range
  const isInsideOtherRepeat = (start: number, end: number): boolean => {
    for (const range of allRepeatRanges) {
      // Check if this range is strictly contained within another range
      if (start > range.start && end < range.end) {
        return true;
      }
    }
    return false;
  };

  // Process repeat bindings (list rendering) - only top-level repeats
  for (const binding of parsed.bindings) {
    if (binding.type !== 'repeat') continue;
    if (!binding.itemsExpression || !binding.itemVar || !binding.itemTemplate) continue;

    // Skip repeats that are nested inside other repeats
    // They will be handled by processItemTemplate recursively
    if (isInsideOtherRepeat(binding.expressionStart, binding.expressionEnd)) continue;

    const signalNames = binding.signalNames || [binding.signalName];
    const repeatId = `b${idCounter++}`;

    // Process the item template with FULL recursive processing
    // This handles signals, events, nested conditionals, nested repeats, etc.
    const itemTemplateProcessed = processItemTemplate(binding.itemTemplate, binding.itemVar, binding.indexVar, idCounter, signalInitializers);
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
      itemEvents: itemTemplateProcessed.events,
      signalBindings: itemTemplateProcessed.signalBindings,
      eventBindings: itemTemplateProcessed.eventBindings,
      nestedConditionals: itemTemplateProcessed.nestedConditionals,
      nestedWhenElse: itemTemplateProcessed.nestedWhenElse,
      nestedRepeats: itemTemplateProcessed.nestedRepeats,
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

    const eventId = `e${eventIdCounter.value++}`;

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
 * Process a conditional element's HTML for the template string.
 *
 * This handles:
 * - Removing the when directive
 * - Adding the conditional ID
 * - Replacing signal expressions with initial values
 * - Converting @event bindings to data-evt-* attributes
 * - Adding IDs to nested elements
 * - Replacing nested conditionals with template anchors
 *
 * @param eventIdCounter - Mutable counter for generating unique event IDs, will be incremented
 */
const processConditionalElementHtml = (
  element: HtmlElement,
  originalHtml: string,
  signalInitializers: Map<string, string | number | boolean>,
  elementIdMap: Map<HtmlElement, string>,
  conditionalId: string,
  nestedConditionalBlocks?: ConditionalBlock[],
  eventIdCounter: { value: number } = { value: 0 },
): { html: string; eventBindings: EventBinding[] } => {
  let html = getElementHtml(element, originalHtml);
  const eventBindings: EventBinding[] = [];

  // Remove the when directive ("${when(...)}")
  if (element.whenDirective) {
    html = html.replace(element.whenDirective, '');
  }

  // Add ID to the opening tag (right after the tag name)
  const tagNameEnd = element.tagName.length + 1; // +1 for '<'
  html = html.substring(0, tagNameEnd) + ` id="${conditionalId}"` + html.substring(tagNameEnd);

  // Replace signal expressions with initial values
  html = replaceExpressionsWithValues(html, signalInitializers);

  // Process @event bindings - convert to data-evt-* attributes
  // Pattern: @eventName.modifier1.modifier2=${handlerExpression}
  const eventAttrRegex = /@([\w.]+)=\$\{([^}]+)\}/g;
  let eventMatch: RegExpExecArray | null;
  const eventReplacements: Array<{ original: string; replacement: string; eventBinding: EventBinding }> = [];

  while ((eventMatch = eventAttrRegex.exec(html)) !== null) {
    const fullMatch = eventMatch[0];
    const eventSpec = eventMatch[1]; // e.g., "click" or "click.stop.prevent"
    const handlerExpression = eventMatch[2].trim();

    // Parse event name and modifiers
    const parts = eventSpec.split('.');
    const eventName = parts[0];
    const modifiers = parts.slice(1);

    const eventId = `e${eventIdCounter.value++}`;

    // Build data-evt attribute value
    const attrValue = modifiers.length > 0 ? `${eventId}:${modifiers.join(':')}` : eventId;

    // Store the replacement
    eventReplacements.push({
      original: fullMatch,
      replacement: `data-evt-${eventName}="${attrValue}"`,
      eventBinding: {
        id: eventId,
        eventName,
        modifiers,
        handlerExpression,
        elementId: conditionalId, // Events on the conditional element itself
        startIndex: 0, // Not used in conditional context
        endIndex: 0,
      },
    });
  }

  // Apply event replacements
  for (const { original, replacement, eventBinding } of eventReplacements) {
    html = html.replace(original, replacement);
    eventBindings.push(eventBinding);
  }

  // Add IDs to nested elements that have bindings
  html = addIdsToNestedElements(html, element, elementIdMap, originalHtml);

  // Replace nested conditional elements with template anchors
  if (nestedConditionalBlocks && nestedConditionalBlocks.length > 0) {
    // For each nested conditional, we need to find and replace its element
    // Since the HTML has been modified, we search for elements with the when directive pattern
    for (const nestedCond of nestedConditionalBlocks) {
      // Search for any element with ${when(...)} attribute pattern that contains this conditional's ID
      // or that we can match by the when expression

      // First try: look for the exact when expression pattern
      const jsExprEscaped = nestedCond.jsExpression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const whenAttrPattern = new RegExp(`"\\$\\{when\\(${jsExprEscaped}\\)\\}"`, 'g');

      // Find element with this when attribute and replace with template
      // Pattern matches: <tagname ...attributes... "${when(expr)}" ...>content</tagname>
      const elementWithWhenPattern = new RegExp(`<(\\w+)([^>]*)"\\$\\{when\\(${jsExprEscaped}\\)\\}"([^>]*)>([\\s\\S]*?)<\\/\\1>`, 'g');

      const match = elementWithWhenPattern.exec(html);
      if (match) {
        // Replace the entire matched element with a template anchor
        html = html.replace(match[0], `<template id="${nestedCond.id}"></template>`);
      } else {
        // Fallback: just try to remove the when attribute if the element has already been assigned an ID
        // and insert a template anchor nearby
        html = html.replace(whenAttrPattern, '');
      }
    }
  }

  // Clean up whitespace
  html = html.replace(/\s+/g, ' ').replace(/\s+>/g, '>').replace(/\s>/g, '>');

  return { html, eventBindings };
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
 * Process item template for repeat blocks with FULL recursive template processing.
 *
 * This function processes the item template the same way as the main template,
 * handling ALL features recursively:
 * - Signal bindings: ${this._class()} → reactive binding with component signals
 * - Item bindings: ${item.label} → reactive binding with item signal
 * - Attribute bindings: class="${...}" → reactive attr binding
 * - Style bindings: style="background: ${...}" → reactive style binding
 * - Event handlers: @click="${...}" → event delegation
 * - Nested when/whenElse/repeat → recursive processing
 *
 * @param templateContent - The raw HTML content of the item template
 * @param itemVar - The item variable name (e.g., "country")
 * @param indexVar - The index variable name (e.g., "index") or undefined
 * @param signalInitializers - Map of signal names to their initial values
 * @param startingId - Starting ID counter for generating unique element IDs
 */
const processItemTemplateRecursively = (
  templateContent: string,
  itemVar: string,
  indexVar: string | undefined,
  signalInitializers: Map<string, string | number | boolean>,
  startingId: number,
): {
  processedContent: string;
  itemBindings: ItemBinding[];
  itemEvents: ItemEventBinding[];
  signalBindings: BindingInfo[];
  eventBindings: EventBinding[];
  nestedConditionals: ConditionalBlock[];
  nestedWhenElse: WhenElseBlock[];
  nestedRepeats: RepeatBlock[];
  nextId: number;
} => {
  // Parse the template using the full HTML parser
  const parsed = parseHtmlTemplate(templateContent);

  const itemBindings: ItemBinding[] = [];
  const itemEvents: ItemEventBinding[] = [];
  const signalBindings: BindingInfo[] = [];
  const eventBindings: EventBinding[] = [];
  const conditionals: ConditionalBlock[] = [];
  const whenElseBlocks: WhenElseBlock[] = [];
  const repeatBlocks: RepeatBlock[] = [];

  let idCounter = startingId;
  const eventIdCounter = { value: 0 };
  let itemEventIdCounter = 0;

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

  // Process conditionals (when directives)
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
      // Skip event bindings - they're handled by processConditionalElementHtml
      if (binding.type === 'event') continue;

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

    const processedCondResult = processConditionalElementHtml(condEl, templateContent, signalInitializers, elementIdMap, conditionalId, undefined, eventIdCounter);

    // Transform item variable references to use signal syntax and detect item bindings
    // For ${city} in the template, we need to:
    // 1. Convert to ${city$()} for the template string
    // 2. Track this as an item binding for reactive updates
    const itemPattern = new RegExp(`\\$\\{\\s*${itemVar}\\s*\\}`, 'g');
    const condItemBindings: ItemBinding[] = [];
    let transformedCondHtml = processedCondResult.html;

    // Find all item variable references in the template
    const itemMatches = [...processedCondResult.html.matchAll(itemPattern)];
    if (itemMatches.length > 0) {
      // We need to wrap the item reference in a span with an ID for binding
      let offset = 0;
      for (const match of itemMatches) {
        const matchStart = match.index! + offset;
        const matchEnd = matchStart + match[0].length;

        // Generate an ID for this text binding
        const itemBindingId = `i${idCounter++}`;

        // Replace ${city} with <span id="iXX">${city$()}</span>
        const replacement = `<span id="${itemBindingId}">\${${itemVar}$()}</span>`;
        transformedCondHtml = transformedCondHtml.substring(0, matchStart) + replacement + transformedCondHtml.substring(matchEnd);

        // Track this as an item binding
        condItemBindings.push({
          elementId: itemBindingId,
          expression: itemVar,
          type: 'text',
        });

        // Adjust offset for next match
        offset += replacement.length - match[0].length;
      }
    }

    conditionals.push({
      id: conditionalId,
      signalName: signalNames[0],
      signalNames,
      jsExpression,
      initialValue,
      templateContent: transformedCondHtml,
      startIndex: condEl.tagStart,
      endIndex: condEl.closeTagEnd,
      nestedBindings,
      nestedItemBindings: condItemBindings,
      nestedConditionals: [], // TODO: Support nested when in item templates
      nestedEventBindings: processedCondResult.eventBindings,
    });

    signalBindings.push(...nestedBindings);
    eventBindings.push(...processedCondResult.eventBindings);
  }

  // Process whenElse bindings (recursive)
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

    // Recursively process then/else templates (they could contain anything)
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

  // Process nested repeat bindings (recursive)
  for (const binding of parsed.bindings) {
    if (binding.type !== 'repeat') continue;
    if (!binding.itemsExpression || !binding.itemVar || !binding.itemTemplate) continue;

    const nestedSignalNames = binding.signalNames || [binding.signalName];
    const nestedRepeatId = `b${idCounter++}`;

    // Recursively process the nested item template
    const nestedProcessed = processItemTemplateRecursively(binding.itemTemplate, binding.itemVar, binding.indexVar, signalInitializers, idCounter);
    idCounter = nestedProcessed.nextId;

    // Process empty template if provided
    let processedEmptyTemplate: string | undefined;
    if (binding.emptyTemplate) {
      processedEmptyTemplate = binding.emptyTemplate.replace(/\s+/g, ' ').trim();
    }

    repeatBlocks.push({
      id: nestedRepeatId,
      signalName: nestedSignalNames[0] || '',
      signalNames: nestedSignalNames,
      itemsExpression: binding.itemsExpression,
      itemVar: binding.itemVar,
      indexVar: binding.indexVar,
      itemTemplate: nestedProcessed.processedContent,
      emptyTemplate: processedEmptyTemplate,
      trackByFn: binding.trackByFn,
      startIndex: binding.expressionStart,
      endIndex: binding.expressionEnd,
      itemBindings: nestedProcessed.itemBindings,
      itemEvents: nestedProcessed.itemEvents,
      signalBindings: nestedProcessed.signalBindings,
      eventBindings: nestedProcessed.eventBindings,
      nestedConditionals: nestedProcessed.nestedConditionals,
      nestedWhenElse: nestedProcessed.nestedWhenElse,
      nestedRepeats: nestedProcessed.nestedRepeats,
    });
  }

  // Build ranges to exclude from direct binding processing
  const conditionalRanges = conditionals.map((c) => ({ start: c.startIndex, end: c.endIndex }));
  const whenElseRanges = whenElseBlocks.map((w) => ({ start: w.startIndex, end: w.endIndex }));
  const repeatRanges = repeatBlocks.map((r) => ({ start: r.startIndex, end: r.endIndex }));
  const allRanges = [...conditionalRanges, ...whenElseRanges, ...repeatRanges];

  // Text binding spans for signal expressions
  const textBindingSpans = new Map<number, string>();

  // Process all bindings from the parser
  for (const binding of parsed.bindings) {
    // Skip if inside a conditional element
    if (elementsInsideConditionals.has(binding.element)) continue;
    // Skip if this is a conditional element
    if (conditionalElementSet.has(binding.element)) continue;
    // Skip complex binding types (handled above)
    if (binding.type === 'when' || binding.type === 'whenElse' || binding.type === 'repeat') continue;

    // Check if inside a range already processed
    const insideRange = allRanges.some((r) => binding.expressionStart >= r.start && binding.expressionStart < r.end);
    if (insideRange) continue;

    // Process event bindings
    if (binding.type === 'event' && binding.eventName && binding.handlerExpression) {
      // Check if this event handler references item/index variables
      const refsItem = new RegExp(`\\b${itemVar}\\b`).test(binding.handlerExpression);
      const refsIndex = indexVar ? new RegExp(`\\b${indexVar}\\b`).test(binding.handlerExpression) : false;

      if (refsItem || refsIndex) {
        // Item event - handled by repeat runtime
        const eventId = `ie${itemEventIdCounter++}`;
        if (!elementIdMap.has(binding.element)) {
          elementIdMap.set(binding.element, `b${idCounter++}`);
        }
        itemEvents.push({
          eventId,
          eventName: binding.eventName,
          modifiers: binding.eventModifiers || [],
          handlerExpression: binding.handlerExpression,
        });
      } else {
        // Component-level event
        const eventId = `e${eventIdCounter.value++}`;
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
      continue;
    }

    // Process text/style/attr bindings
    if (binding.type === 'text' || binding.type === 'style' || binding.type === 'attr') {
      // This is a signal binding like ${this._class()}
      // These need to be tracked for reactive updates
      const spanId = `b${idCounter++}`;

      if (binding.type === 'text') {
        textBindingSpans.set(binding.expressionStart, spanId);
      } else {
        // For style/attr, assign ID to the element
        if (!elementIdMap.has(binding.element)) {
          elementIdMap.set(binding.element, spanId);
        }
      }

      signalBindings.push({
        id: binding.type === 'text' ? spanId : elementIdMap.get(binding.element)!,
        signalName: binding.signalName,
        type: binding.type as 'text' | 'style' | 'attr',
        property: binding.property,
        isInsideConditional: false,
        conditionalId: undefined,
      });
    }
  }

  // Now process item-specific bindings (expressions with item/index variables)
  // These are NOT in the parsed.bindings because they don't match this.signal() pattern
  // We need to find them manually

  // Process item expressions in text content
  // Pattern: ${country} or ${country.property} etc.
  const itemExprRegex = new RegExp(`\\$\\{([^}]*\\b${itemVar}\\b[^}]*)\\}`, 'g');

  // Find item expressions that are text content (not in attributes, not inside complex blocks)
  const itemTextMatches: Array<{ start: number; end: number; expr: string; id: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = itemExprRegex.exec(templateContent)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    // Skip if inside a processed range
    const insideRange = allRanges.some((r) => matchStart >= r.start && matchStart < r.end);
    if (insideRange) continue;

    // Check if inside an attribute value by looking backwards for ="
    const beforeText = templateContent.substring(Math.max(0, matchStart - 200), matchStart);
    // Simple heuristic: if the last non-whitespace before is =", we're in an attribute
    const inAttr = /=["'][^"']*$/.test(beforeText);

    if (!inAttr) {
      // This is a text expression
      const id = `i${idCounter++}`;
      const expression = match[1].trim();

      itemBindings.push({
        elementId: id,
        type: 'text',
        expression: expression,
      });

      itemTextMatches.push({ start: matchStart, end: matchEnd, expr: expression, id });
    }
  }

  // Process item expressions in attributes
  const indexPattern = indexVar ? `|${indexVar}` : '';
  const attrItemRegex = new RegExp(`(\\w+)=["']\\$\\{([^}]*\\b(?:${itemVar}${indexPattern})\\b[^}]*)\\}["']`, 'g');
  const itemAttrMatches: Array<{ start: number; end: number; attrName: string; expr: string; id: string }> = [];

  while ((match = attrItemRegex.exec(templateContent)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    // Skip if inside a processed range
    const insideRange = allRanges.some((r) => matchStart >= r.start && matchStart < r.end);
    if (insideRange) continue;

    const id = `i${idCounter++}`;
    const attrName = match[1];
    const expression = match[2].trim();

    itemBindings.push({
      elementId: id,
      type: 'attr',
      property: attrName,
      expression: expression,
    });

    itemAttrMatches.push({ start: matchStart, end: matchEnd, attrName, expr: expression, id });
  }

  // Generate processed HTML
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  // Replace conditional elements
  for (const cond of conditionals) {
    const replacement = cond.initialValue ? cond.templateContent : `<template id="${cond.id}"></template>`;
    edits.push({ start: cond.startIndex, end: cond.endIndex, replacement });
  }

  // Replace whenElse expressions
  for (const we of whenElseBlocks) {
    const thenReplacement = we.initialValue ? injectIdIntoFirstElement(we.thenTemplate, we.thenId) : `<template id="${we.thenId}"></template>`;
    const elseReplacement = we.initialValue ? `<template id="${we.elseId}"></template>` : injectIdIntoFirstElement(we.elseTemplate, we.elseId);
    edits.push({ start: we.startIndex, end: we.endIndex, replacement: thenReplacement + elseReplacement });
  }

  // Replace nested repeat expressions with anchor templates
  for (const rep of repeatBlocks) {
    edits.push({ start: rep.startIndex, end: rep.endIndex, replacement: `<template id="${rep.id}"></template>` });
  }

  // Replace signal text expressions with span-wrapped values
  for (const [exprPos, spanId] of textBindingSpans) {
    // Find the expression at this position
    const exprMatch = /\$\{this\.(\w+)\(\)\}/.exec(templateContent.substring(exprPos));
    if (exprMatch && exprMatch.index === 0) {
      const signalName = exprMatch[1];
      const value = signalInitializers.get(signalName);
      const valueStr = value !== undefined ? String(value) : '';
      edits.push({
        start: exprPos,
        end: exprPos + exprMatch[0].length,
        replacement: `<span id="${spanId}">${valueStr}</span>`,
      });
    }
  }

  // Replace item text expressions with span-wrapped template expressions
  for (const { start, end, expr, id } of itemTextMatches) {
    // Transform item references to use item$() signal getter syntax
    const transformedExpr = expr.replace(new RegExp(`\\b${itemVar}\\b`, 'g'), `${itemVar}$()`);
    edits.push({
      start,
      end,
      replacement: `<span id="${id}">\${${transformedExpr}}</span>`,
    });
  }

  // Replace item attribute expressions
  for (const { start, end, attrName, expr, id } of itemAttrMatches) {
    // Transform item references to use item$() signal getter syntax
    let transformedExpr = expr.replace(new RegExp(`\\b${itemVar}\\b`, 'g'), `${itemVar}$()`);
    if (indexVar) {
      transformedExpr = transformedExpr.replace(new RegExp(`\\b${indexVar}\\b`, 'g'), indexVar);
    }
    edits.push({
      start,
      end,
      replacement: `data-bind-id="${id}" ${attrName}="\${${transformedExpr}}"`,
    });
  }

  // Add IDs to elements with signal bindings (not inside ranges)
  for (const [element, id] of elementIdMap) {
    const insideRange = allRanges.some((r) => element.tagStart >= r.start && element.tagStart < r.end);
    if (insideRange) continue;
    if (element.attributes.has('id')) continue;

    // Check if this element has event bindings that need data-evt attributes
    const evtAttrs: string[] = [];
    for (const evt of eventBindings) {
      if (evt.elementId === id) {
        const attrValue = evt.modifiers.length > 0 ? `${evt.id}:${evt.modifiers.join(':')}` : evt.id;
        evtAttrs.push(`data-evt-${evt.eventName}="${attrValue}"`);
      }
    }
    for (const evt of itemEvents) {
      // For item events, we also add data-evt attributes
      const attrValue = evt.modifiers.length > 0 ? `${evt.eventId}:${evt.modifiers.join(':')}` : evt.eventId;
      // Note: we need to check if this element has this event - simplified check
      evtAttrs.push(`data-evt-${evt.eventName}="${attrValue}"`);
    }

    const attrsToAdd = [`id="${id}"`, ...evtAttrs].join(' ');
    edits.push({ start: element.tagNameEnd, end: element.tagNameEnd, replacement: ' ' + attrsToAdd });
  }

  // Remove @event attributes from HTML (they've been converted to data-evt)
  for (const binding of parsed.bindings) {
    if (binding.type === 'event') {
      // Don't add duplicate edits - check if already covered
      const alreadyEdited = edits.some((e) => e.start <= binding.expressionStart && e.end >= binding.expressionEnd);
      if (!alreadyEdited) {
        edits.push({ start: binding.expressionStart, end: binding.expressionEnd, replacement: '' });
      }
    }
  }

  // Apply edits in reverse order
  edits.sort((a, b) => b.start - a.start);

  let result = templateContent;
  for (const edit of edits) {
    result = result.substring(0, edit.start) + edit.replacement + result.substring(edit.end);
  }

  // Normalize whitespace but preserve single spaces
  result = result.replace(/\s+/g, ' ').trim();

  return {
    processedContent: result,
    itemBindings,
    itemEvents,
    signalBindings,
    eventBindings,
    nestedConditionals: conditionals,
    nestedWhenElse: whenElseBlocks,
    nestedRepeats: repeatBlocks,
    nextId: idCounter,
  };
};

/**
 * Legacy wrapper for simple item template processing (backward compatibility).
 * Now delegates to the full recursive processor.
 */
const processItemTemplate = (
  templateContent: string,
  itemVar: string,
  indexVar: string | undefined,
  startingId: number,
  signalInitializers: Map<string, string | number | boolean> = new Map(),
): {
  processedContent: string;
  bindings: ItemBinding[];
  events: ItemEventBinding[];
  signalBindings: BindingInfo[];
  eventBindings: EventBinding[];
  nestedConditionals: ConditionalBlock[];
  nestedWhenElse: WhenElseBlock[];
  nestedRepeats: RepeatBlock[];
  nextId: number;
} => {
  const result = processItemTemplateRecursively(templateContent, itemVar, indexVar, signalInitializers, startingId);
  return {
    processedContent: result.processedContent,
    bindings: result.itemBindings,
    events: result.itemEvents,
    signalBindings: result.signalBindings,
    eventBindings: result.eventBindings,
    nestedConditionals: result.nestedConditionals,
    nestedWhenElse: result.nestedWhenElse,
    nestedRepeats: result.nestedRepeats,
    nextId: result.nextId,
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
  const eventIdCounter = { value: 0 };

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
      // Skip event bindings - they're handled by processConditionalElementHtml
      if (binding.type === 'event') continue;

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

    const processedCondResult = processConditionalElementHtml(condEl, templateContent, signalInitializers, elementIdMap, conditionalId, undefined, eventIdCounter);

    conditionals.push({
      id: conditionalId,
      signalName: signalNames[0],
      signalNames,
      jsExpression,
      initialValue,
      templateContent: processedCondResult.html,
      startIndex: condEl.tagStart,
      endIndex: condEl.closeTagEnd,
      nestedBindings,
      nestedItemBindings: [],
      nestedConditionals: [], // TODO: Support nested when in processSimpleTemplate
      nestedEventBindings: processedCondResult.eventBindings,
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
    const nestedConds = cond.nestedConditionals || [];
    const escapedTemplate = cond.templateContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    // Generate nested bindings initializer with consolidated subscriptions
    let nestedCode = '() => []';
    if (nestedBindings.length > 0 || nestedConds.length > 0) {
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

      // Generate nested conditional bindings (when inside when)
      for (const nestedCond of nestedConds) {
        const nestedCondEscaped = nestedCond.templateContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');

        // Generate inner bindings initializer
        let innerNestedCode = '() => []';
        if (nestedCond.nestedBindings.length > 0) {
          const innerBindingLines: string[] = [];
          const innerIds = [...new Set(nestedCond.nestedBindings.map((b) => b.id))];
          innerBindingLines.push('() => {');
          for (const id of innerIds) {
            innerBindingLines.push(`        const ${id} = r.getElementById('${id}');`);
          }
          for (const binding of nestedCond.nestedBindings) {
            innerBindingLines.push(`        ${generateInitialValueCode(binding)};`);
          }
          const innerGroups = groupBindingsBySignal(nestedCond.nestedBindings);
          innerBindingLines.push('        return [');
          for (const [signalName, signalBindings] of innerGroups) {
            innerBindingLines.push(`          ${generateConsolidatedSubscription(signalName, signalBindings)},`);
          }
          innerBindingLines.push('        ];');
          innerBindingLines.push('      }');
          innerNestedCode = innerBindingLines.join('\n');
        }

        const isNestedSimple = nestedCond.signalNames.length === 1 && nestedCond.jsExpression === `this.${nestedCond.signalName}()`;
        if (isNestedSimple) {
          nestedLines.push(`        ${BIND_FN.IF}(r, this.${nestedCond.signalName}, '${nestedCond.id}', \`${nestedCondEscaped}\`, ${innerNestedCode}),`);
        } else {
          const nestedSignalsArray = nestedCond.signalNames.map((s) => `this.${s}`).join(', ');
          nestedLines.push(
            `        ${BIND_FN.IF_EXPR}(r, [${nestedSignalsArray}], () => ${nestedCond.jsExpression}, '${nestedCond.id}', \`${nestedCondEscaped}\`, ${innerNestedCode}),`,
          );
        }
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

  // Generate repeat bindings (fine-grained signal-per-item approach)
  for (const rep of repeatBlocks) {
    // Escape backticks and newlines for the template string
    const escapedItemTemplate = rep.itemTemplate
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/`/g, '\\`') // Escape backticks
      .replace(/\n/g, '\\n') // Escape newlines
      .replace(/\r/g, '\\r'); // Escape carriage returns

    // Signal-per-item approach: item variable becomes a signal (item$)
    const itemSignalVar = `${rep.itemVar}$`;
    const indexVar = rep.indexVar || '_idx';

    // Template function receives the item signal and index
    // Template expressions have already been transformed to use item$() syntax by processItemTemplate
    const templateFn = `(${itemSignalVar}, ${indexVar}) => \`${escapedItemTemplate}\``;

    // Generate the binding initializer that subscribes to the item signal
    // AND component-level signals (like this._class())
    // AND initializes nested repeats and conditionals
    let initItemBindingsFn: string;

    // Combine item bindings, signal bindings, nested repeats, AND nested conditionals into the init function
    const hasItemBindings = rep.itemBindings.length > 0;
    const hasSignalBindings = rep.signalBindings.length > 0;
    const hasNestedRepeats = rep.nestedRepeats.length > 0;
    const hasNestedConditionals = rep.nestedConditionals.length > 0;

    if (!hasItemBindings && !hasSignalBindings && !hasNestedRepeats && !hasNestedConditionals) {
      // No reactive bindings, nested repeats, or nested conditionals in the item template
      initItemBindingsFn = `(els, ${itemSignalVar}, ${indexVar}) => []`;
    } else {
      const subscriptionLines: string[] = [];
      const nestedRepeatLines: string[] = [];
      const nestedConditionalLines: string[] = [];

      // Use the shared element finder from runtime - much smaller than inline!
      const findElCode = `const $ = (id) => ${BIND_FN.FIND_EL}(els, id);`;

      // Generate subscriptions for item bindings (expressions using item/index)
      if (hasItemBindings) {
        // Group bindings by expression to share subscriptions
        const bindingsByExpr = new Map<string, ItemBinding[]>();

        for (const binding of rep.itemBindings) {
          const key = `${binding.type}:${binding.expression}:${binding.property || ''}`;
          if (!bindingsByExpr.has(key)) {
            bindingsByExpr.set(key, []);
          }
          bindingsByExpr.get(key)!.push(binding);
        }

        for (const [, bindings] of bindingsByExpr) {
          const first = bindings[0];
          // Transform the expression to use the signal getter
          const signalExpr = first.expression.replace(new RegExp(`\\b${rep.itemVar}\\b`, 'g'), `${itemSignalVar}()`);

          // Build update statements for all elements with this expression
          const updateStatements: string[] = [];

          for (const binding of bindings) {
            if (binding.type === 'text') {
              updateStatements.push(`e = $('${binding.elementId}'); if (e) e.textContent = v;`);
            } else if (binding.type === 'attr' && binding.property) {
              updateStatements.push(`e = $('${binding.elementId}'); if (e) e.setAttribute('${binding.property}', v);`);
            } else if (binding.type === 'style' && binding.property) {
              updateStatements.push(`e = $('${binding.elementId}'); if (e) e.style.${binding.property} = v;`);
            }
          }

          if (updateStatements.length > 0) {
            subscriptionLines.push(`${itemSignalVar}.subscribe(() => { let e; const v = ${signalExpr}; ${updateStatements.join(' ')} }, true)`);
          }
        }
      }

      // Generate subscriptions for signal bindings (component-level signals like this._class())
      if (hasSignalBindings) {
        // Group by signal name
        const signalGroups = groupBindingsBySignal(rep.signalBindings);

        for (const [signalName, bindings] of signalGroups) {
          const updateStatements: string[] = [];

          for (const binding of bindings) {
            if (binding.type === 'text') {
              updateStatements.push(`e = $('${binding.id}'); if (e) e.textContent = v;`);
            } else if (binding.type === 'attr' && binding.property) {
              updateStatements.push(`e = $('${binding.id}'); if (e) e.setAttribute('${binding.property}', v);`);
            } else if (binding.type === 'style' && binding.property) {
              const prop = toCamelCase(binding.property);
              updateStatements.push(`e = $('${binding.id}'); if (e) e.style.${prop} = v;`);
            }
          }

          if (updateStatements.length > 0) {
            subscriptionLines.push(`this.${signalName}.subscribe(v => { let e; ${updateStatements.join(' ')} }, true)`);
          }
        }
      }

      // Generate __bindNestedRepeat calls for nested repeats
      if (hasNestedRepeats) {
        for (const nestedRep of rep.nestedRepeats) {
          // Escape the nested template
          const nestedEscapedTemplate = nestedRep.itemTemplate.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

          const nestedItemSignalVar = `${nestedRep.itemVar}$`;
          const nestedIndexVar = nestedRep.indexVar || '_idx2';

          // Nested template function
          const nestedTemplateFn = `(${nestedItemSignalVar}, ${nestedIndexVar}) => \`${nestedEscapedTemplate}\``;

          // Nested init bindings function - handles item bindings AND nested conditionals
          let nestedInitBindingsFn: string;
          const hasNestedItemBindings = nestedRep.itemBindings.length > 0;
          const hasNestedConditionalsInNested = nestedRep.nestedConditionals.length > 0;

          if (hasNestedItemBindings || hasNestedConditionalsInNested) {
            // Use the shared element finder from runtime
            const nestedFindElCode = `const $n = (id) => ${BIND_FN.FIND_EL}(nel, id);`;
            const nestedUpdates: string[] = [];

            // Handle item bindings
            for (const binding of nestedRep.itemBindings) {
              const signalExpr = binding.expression.replace(new RegExp(`\\b${nestedRep.itemVar}\\b`, 'g'), `${nestedItemSignalVar}()`);

              if (binding.type === 'text') {
                nestedUpdates.push(`${nestedItemSignalVar}.subscribe(() => { const el = $n('${binding.elementId}'); if (el) el.textContent = ${signalExpr}; }, true)`);
              } else if (binding.type === 'attr' && binding.property) {
                nestedUpdates.push(
                  `${nestedItemSignalVar}.subscribe(() => { const el = $n('${binding.elementId}'); if (el) el.setAttribute('${binding.property}', ${signalExpr}); }, true)`,
                );
              }
            }

            // Handle nested conditionals (when directives) inside nested repeat
            for (const nestedCond of nestedRep.nestedConditionals) {
              // Escape template but preserve ${itemVar$()} expressions since they're evaluated at runtime
              // The __bindIf call is inside initItemBindings where itemVar$ is in scope
              let condEscapedTemplate = nestedCond.templateContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

              // Only escape $ that are NOT part of ${itemVar$()} expressions
              // We want ${city$()} to remain unescaped so it evaluates at runtime
              // Note: nestedItemSignalVar contains $ which must be escaped in regex
              const escapedSignalVar = nestedItemSignalVar.replace(/\$/g, '\\$');
              const itemSignalPattern = new RegExp(`\\$\\{${escapedSignalVar}\\(\\)\\}`, 'g');
              const placeholder = '___ITEM_SIGNAL_PLACEHOLDER___';

              // Temporarily replace item signal expressions with placeholder
              condEscapedTemplate = condEscapedTemplate.replace(itemSignalPattern, placeholder);
              // Escape remaining $ signs
              condEscapedTemplate = condEscapedTemplate.replace(/\$/g, '\\$');
              // Restore item signal expressions (unescaped)
              condEscapedTemplate = condEscapedTemplate.replace(new RegExp(placeholder, 'g'), `\${${nestedItemSignalVar}()}`);

              // Generate nested binding initializer for the conditional's inner bindings
              // This includes both signal bindings (nestedBindings) and item bindings (nestedItemBindings)
              const condBindingUpdates: string[] = [];

              // Handle signal bindings inside the conditional
              for (const binding of nestedCond.nestedBindings) {
                if (binding.type === 'text') {
                  condBindingUpdates.push(`this.${binding.signalName}.subscribe(v => { const el = $n('${binding.id}'); if (el) el.textContent = v; }, true)`);
                } else if (binding.type === 'attr' && binding.property) {
                  condBindingUpdates.push(
                    `this.${binding.signalName}.subscribe(v => { const el = $n('${binding.id}'); if (el) el.setAttribute('${binding.property}', v); }, true)`,
                  );
                } else if (binding.type === 'style' && binding.property) {
                  const prop = toCamelCase(binding.property);
                  condBindingUpdates.push(`this.${binding.signalName}.subscribe(v => { const el = $n('${binding.id}'); if (el) el.style.${prop} = v; }, true)`);
                }
              }

              // Handle item bindings inside the conditional (e.g., ${city} from parent repeat)
              for (const binding of nestedCond.nestedItemBindings) {
                const signalExpr = binding.expression.replace(new RegExp(`\\b${nestedRep.itemVar}\\b`, 'g'), `${nestedItemSignalVar}()`);

                if (binding.type === 'text') {
                  condBindingUpdates.push(`${nestedItemSignalVar}.subscribe(() => { const el = $n('${binding.elementId}'); if (el) el.textContent = ${signalExpr}; }, true)`);
                } else if (binding.type === 'attr' && binding.property) {
                  condBindingUpdates.push(
                    `${nestedItemSignalVar}.subscribe(() => { const el = $n('${binding.elementId}'); if (el) el.setAttribute('${binding.property}', ${signalExpr}); }, true)`,
                  );
                }
              }

              let condNestedCode = '() => []';
              if (condBindingUpdates.length > 0) {
                condNestedCode = `() => [${condBindingUpdates.join(', ')}]`;
              }

              // Check if simple or complex expression
              const isSimple = nestedCond.signalNames.length === 1 && nestedCond.jsExpression === `this.${nestedCond.signalName}()`;

              if (isSimple) {
                nestedUpdates.push(`${BIND_FN.IF}({ getElementById: $n }, this.${nestedCond.signalName}, '${nestedCond.id}', \`${condEscapedTemplate}\`, ${condNestedCode})`);
              } else {
                const signalsArray = nestedCond.signalNames.map((s) => `this.${s}`).join(', ');
                nestedUpdates.push(
                  `${BIND_FN.IF_EXPR}({ getElementById: $n }, [${signalsArray}], () => ${nestedCond.jsExpression}, '${nestedCond.id}', \`${condEscapedTemplate}\`, ${condNestedCode})`,
                );
              }
            }

            nestedInitBindingsFn = `(nel, ${nestedItemSignalVar}, ${nestedIndexVar}) => { ${nestedFindElCode} return [${nestedUpdates.join(', ')}]; }`;
          } else {
            nestedInitBindingsFn = `(nel, ${nestedItemSignalVar}, ${nestedIndexVar}) => []`;
          }

          // Generate the nested repeat call
          // Determine how to access the nested array:
          // - If it references the parent item var (e.g., "item.children"), transform to use parent item signal
          // - If it's a component signal (e.g., "this._items()"), use as-is
          let nestedArrayExpr: string;
          const refsParentItem = new RegExp(`\\b${rep.itemVar}\\b`).test(nestedRep.itemsExpression);

          if (refsParentItem) {
            // Transform item.children to item$().children
            nestedArrayExpr = nestedRep.itemsExpression.replace(new RegExp(`\\b${rep.itemVar}\\b`, 'g'), `${itemSignalVar}()`);
          } else if (nestedRep.signalName && nestedRep.signalNames.length > 0) {
            // It's a component signal reference
            nestedArrayExpr = `this.${nestedRep.signalName}`;
          } else {
            // Use the full expression as-is (could be a method call or other expression)
            nestedArrayExpr = nestedRep.itemsExpression;
          }

          nestedRepeatLines.push(`${BIND_FN.NESTED_REPEAT}(els, ${itemSignalVar}, () => ${nestedArrayExpr}, '${nestedRep.id}', ${nestedTemplateFn}, ${nestedInitBindingsFn})`);
        }
      }

      // Generate __bindIf/__bindIfExpr calls for nested conditionals inside repeat
      if (hasNestedConditionals) {
        for (const nestedCond of rep.nestedConditionals) {
          const condEscapedTemplate = nestedCond.templateContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

          // Generate nested binding initializer for the conditional's inner bindings
          let condNestedCode = '() => []';
          if (nestedCond.nestedBindings.length > 0) {
            const condBindingUpdates: string[] = [];
            for (const binding of nestedCond.nestedBindings) {
              if (binding.type === 'text') {
                condBindingUpdates.push(`this.${binding.signalName}.subscribe(v => { const el = $('${binding.id}'); if (el) el.textContent = v; }, true)`);
              } else if (binding.type === 'attr' && binding.property) {
                condBindingUpdates.push(`this.${binding.signalName}.subscribe(v => { const el = $('${binding.id}'); if (el) el.setAttribute('${binding.property}', v); }, true)`);
              } else if (binding.type === 'style' && binding.property) {
                const prop = toCamelCase(binding.property);
                condBindingUpdates.push(`this.${binding.signalName}.subscribe(v => { const el = $('${binding.id}'); if (el) el.style.${prop} = v; }, true)`);
              }
            }
            if (condBindingUpdates.length > 0) {
              condNestedCode = `() => [${condBindingUpdates.join(', ')}]`;
            }
          }

          // Check if simple or complex expression
          const isSimple = nestedCond.signalNames.length === 1 && nestedCond.jsExpression === `this.${nestedCond.signalName}()`;

          if (isSimple) {
            nestedConditionalLines.push(`${BIND_FN.IF}({ getElementById: $ }, this.${nestedCond.signalName}, '${nestedCond.id}', \`${condEscapedTemplate}\`, ${condNestedCode})`);
          } else {
            const signalsArray = nestedCond.signalNames.map((s) => `this.${s}`).join(', ');
            nestedConditionalLines.push(
              `${BIND_FN.IF_EXPR}({ getElementById: $ }, [${signalsArray}], () => ${nestedCond.jsExpression}, '${nestedCond.id}', \`${condEscapedTemplate}\`, ${condNestedCode})`,
            );
          }
        }
      }

      // Combine all subscription lines, nested repeat calls, and nested conditional calls
      const allCleanupLines = [...subscriptionLines, ...nestedRepeatLines, ...nestedConditionalLines];

      if (allCleanupLines.length > 0) {
        initItemBindingsFn = `(els, ${itemSignalVar}, ${indexVar}) => { ${findElCode} return [\n      ${allCleanupLines.join(',\n      ')}\n    ]; }`;
      } else {
        initItemBindingsFn = `(els, ${itemSignalVar}, ${indexVar}) => []`;
      }
    }

    // Generate event handlers map for events inside repeat template
    let itemEventHandlersArg = '';
    if (rep.itemEvents.length > 0) {
      // Group events by type
      const eventsByType = new Map<string, ItemEventBinding[]>();
      for (const evt of rep.itemEvents) {
        if (!eventsByType.has(evt.eventName)) {
          eventsByType.set(evt.eventName, []);
        }
        eventsByType.get(evt.eventName)!.push(evt);
      }

      // Build the event handlers object
      const eventTypeLines: string[] = [];
      for (const [eventType, handlers] of eventsByType) {
        const handlerLines = handlers.map((h) => {
          // The handler needs to receive itemSignal and index
          // Transform item references in the handler expression to use itemSignal()
          let handlerExpr = h.handlerExpression;
          // Replace item variable references with itemSignal()
          handlerExpr = handlerExpr.replace(new RegExp(`\\b${rep.itemVar}\\b`, 'g'), `${itemSignalVar}()`);
          // Replace index variable if present
          if (rep.indexVar) {
            handlerExpr = handlerExpr.replace(new RegExp(`\\b${rep.indexVar}\\b`, 'g'), indexVar);
          }

          // Handle different handler expression formats:
          // 1. Arrow function: () => expr OR (e) => expr → extract and execute the body
          // 2. Method reference: this.method → call it with event
          // 3. Direct call: this.method(args) → execute as-is
          const arrowMatch = handlerExpr.match(/^\s*\(?([^)]*)\)?\s*=>\s*(.+)$/);
          if (arrowMatch) {
            // It's an arrow function - extract and execute the body
            const body = arrowMatch[2].trim();
            // If body doesn't end with semicolon and isn't a block, it's an expression
            if (!body.startsWith('{')) {
              handlerExpr = body;
            } else {
              // It's a block body, remove the braces
              handlerExpr = body.slice(1, -1).trim();
            }
          } else if (/^this\._?\w+$/.test(handlerExpr)) {
            // It's a method reference - call it with event
            handlerExpr = `${handlerExpr}(e)`;
          }
          // Otherwise use as-is (it's likely a direct call like this.method(args))

          return `'${h.eventId}': (${itemSignalVar}, ${indexVar}, e) => { ${handlerExpr}; }`;
        });
        eventTypeLines.push(`${eventType}: { ${handlerLines.join(', ')} }`);
      }

      itemEventHandlersArg = `, { ${eventTypeLines.join(', ')} }`;
    }

    // Build the __bindRepeat call
    let bindRepeatCall = `${BIND_FN.REPEAT}(r, this.${rep.signalName}, '${rep.id}', ${templateFn}, ${initItemBindingsFn}`;

    // Add emptyTemplate if provided (or undefined if we have events)
    if (rep.emptyTemplate) {
      const escapedEmptyTemplate = rep.emptyTemplate.replace(/`/g, '\\`');
      bindRepeatCall += `, \`${escapedEmptyTemplate}\``;
    } else if (itemEventHandlersArg) {
      // Need to pass undefined for emptyTemplate if we have event handlers
      bindRepeatCall += `, undefined`;
    }

    // Add event handlers if present
    bindRepeatCall += itemEventHandlersArg;

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
    // Add __bindNestedRepeat if there are nested repeats
    const hasNestedRepeats = allRepeatBlocks.some((rep) => rep.nestedRepeats.length > 0);
    if (hasNestedRepeats) requiredFunctions.push(BIND_FN.NESTED_REPEAT);
    // Add __findEl if there are repeat blocks with item bindings (uses shared finder)
    const hasRepeatItemBindings = allRepeatBlocks.some((rep) => rep.itemBindings.length > 0 || rep.nestedRepeats.some((nr) => nr.itemBindings.length > 0));
    if (hasRepeatItemBindings) requiredFunctions.push(BIND_FN.FIND_EL);
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
