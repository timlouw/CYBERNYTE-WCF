/**
 * Reactive Binding Compiler Plugin
 *
 * Transforms signal expressions in templates into efficient DOM bindings.
 * Generates static templates and binding initialization code.
 * Supports conditional rendering with if="${this.signal()}" directives.
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
 * // Before: html`<div if="${this.isVisible()}">${this.count()}</div>`
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
  findElementsWithAttribute,
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
  signalName: string;
  initialValue: boolean;
  templateContent: string; // HTML to insert when true
  startIndex: number; // Position in HTML where the element/block starts
  endIndex: number; // Position where it ends
  nestedBindings: BindingInfo[]; // Bindings inside this conditional
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
 */
const findHtmlTemplates = (sourceFile: ts.SourceFile): TemplateInfo[] => {
  const templates: TemplateInfo[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isTaggedTemplateExpression(node) && isHtmlTemplate(node)) {
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
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
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
 */
const processHtmlTemplateWithConditionals = (
  templateContent: string,
  signalInitializers: Map<string, string | number | boolean>,
  startingId: number,
): {
  processedContent: string;
  bindings: BindingInfo[];
  conditionals: ConditionalBlock[];
  nextId: number;
  hasConditionals: boolean;
} => {
  // Parse the HTML using the state machine parser
  const parsed = parseHtmlTemplate(templateContent);

  const bindings: BindingInfo[] = [];
  const conditionals: ConditionalBlock[] = [];
  let idCounter = startingId;

  // Track which elements need IDs and what ID they get
  const elementIdMap = new Map<HtmlElement, string>();

  // Find all conditional elements (those with if attribute)
  const conditionalElements = findElementsWithAttribute(parsed.roots, 'if');
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
    const ifAttr = condEl.attributes.get('if')!;
    const ifMatch = ifAttr.value.match(/^\$\{this\.(\w+)\(\)\}$/);
    if (!ifMatch) continue;

    const signalName = ifMatch[1];
    const conditionalId = `b${idCounter++}`;
    elementIdMap.set(condEl, conditionalId);

    const initialValue = Boolean(signalInitializers.get(signalName));

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

      // Skip the 'if' binding itself
      if (binding.type === 'if') continue;

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
      signalName,
      initialValue,
      templateContent: processedCondHtml,
      startIndex: condEl.tagStart,
      endIndex: condEl.closeTagEnd,
      nestedBindings,
    });

    bindings.push(...nestedBindings);
  }

  // Second pass: Process non-conditional bindings
  for (const binding of parsed.bindings) {
    // Skip if this element is inside a conditional
    if (elementsInsideConditionals.has(binding.element)) continue;
    // Skip if this is a conditional element (already processed)
    if (conditionalElementSet.has(binding.element)) continue;
    // Skip 'if' bindings (they're handled as conditionals)
    if (binding.type === 'if') continue;

    // Get or assign ID for the element
    if (!elementIdMap.has(binding.element)) {
      elementIdMap.set(binding.element, `b${idCounter++}`);
    }
    const elementId = elementIdMap.get(binding.element)!;

    bindings.push({
      id: elementId,
      signalName: binding.signalName,
      type: binding.type as 'text' | 'style' | 'attr',
      property: binding.property,
      isInsideConditional: false,
      conditionalId: undefined,
    });
  }

  // Generate the processed HTML output
  const processedContent = generateProcessedHtml(templateContent, parsed, signalInitializers, elementIdMap, conditionals);

  return {
    processedContent,
    bindings,
    conditionals,
    nextId: idCounter,
    hasConditionals: conditionals.length > 0,
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

  // Remove the if attribute
  const ifAttr = element.attributes.get('if')!;
  const ifAttrStr = `if="${ifAttr.value}"`;
  html = html.replace(ifAttrStr, '');

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
      if (name !== 'if') {
        // Use the processed attribute value (with expressions replaced)
        const processedValue = replaceExpressionsWithValues(attr.value, new Map());
        existingAttrs.push(`${name}="${processedValue}"`);
      }
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
 * Generate the final processed HTML output
 */
const generateProcessedHtml = (
  originalHtml: string,
  parsed: ParsedTemplate,
  signalInitializers: Map<string, string | number | boolean>,
  elementIdMap: Map<HtmlElement, string>,
  conditionals: ConditionalBlock[],
): string => {
  // Build list of edits to apply
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  // Replace conditional elements with their processed versions or templates
  for (const cond of conditionals) {
    const replacement = cond.initialValue ? cond.templateContent : `<template id="${cond.id}"></template>`;
    edits.push({
      start: cond.startIndex,
      end: cond.endIndex,
      replacement,
    });
  }

  // Replace expressions in non-conditional parts
  const conditionalRanges = conditionals.map((c) => ({ start: c.startIndex, end: c.endIndex }));

  const exprRegex = /\$\{this\.(\w+)\(\)\}/g;
  let match: RegExpExecArray | null;

  while ((match = exprRegex.exec(originalHtml)) !== null) {
    const exprStart = match.index;
    const exprEnd = exprStart + match[0].length;

    // Skip if inside a conditional range
    const insideConditional = conditionalRanges.some((r) => exprStart >= r.start && exprStart < r.end);
    if (insideConditional) continue;

    const signalName = match[1];
    const value = signalInitializers.get(signalName);
    const replacement = value !== undefined ? String(value) : '';

    edits.push({ start: exprStart, end: exprEnd, replacement });
  }

  // Add IDs to elements that need them (not inside conditionals)
  for (const [element, id] of elementIdMap) {
    // Skip elements that are inside conditionals
    const insideConditional = conditionalRanges.some((r) => element.tagStart >= r.start && element.tagStart < r.end);
    if (insideConditional) continue;

    // Check if element already has an id attribute
    if (element.attributes.has('id')) continue;

    // Add ID after tag name
    edits.push({
      start: element.tagNameEnd,
      end: element.tagNameEnd,
      replacement: ` id="${id}"`,
    });
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
 * Generate binding code for a single binding (used for both top-level and nested)
 * For text bindings, uses .firstChild.data to update only the text node (minimal DOM mutation)
 */
const generateSingleBindingCode = (binding: BindingInfo, useCache: boolean): string => {
  const elRef = useCache ? binding.id : `r.getElementById('${binding.id}')`;

  if (binding.type === 'style') {
    const prop = toCamelCase(binding.property!);
    return `this.${binding.signalName}.subscribe(v => { ${elRef}.style.${prop} = v; })`;
  } else if (binding.type === 'attr') {
    return `this.${binding.signalName}.subscribe(v => { ${elRef}.setAttribute('${binding.property}', v); })`;
  } else {
    // Text binding: update text node directly for minimal DOM mutation
    return `this.${binding.signalName}.subscribe(v => { ${elRef}.firstChild.data = v; })`;
  }
};

/**
 * Generate the complete initializeBindings function with cached refs and conditionals
 */
const generateInitBindingsFunction = (bindings: BindingInfo[], conditionals: ConditionalBlock[]): string => {
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

  // Generate subscriptions for top-level bindings
  for (const binding of topLevelBindings) {
    lines.push(`    ${generateSingleBindingCode(binding, true)};`);
  }

  // Generate conditional bindings
  for (const cond of conditionals) {
    const nestedBindings = cond.nestedBindings;
    const escapedTemplate = cond.templateContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    // Generate nested bindings initializer
    let nestedCode = '() => []';
    if (nestedBindings.length > 0) {
      const nestedIds = [...new Set(nestedBindings.map((b) => b.id))];
      const nestedLines: string[] = [];
      nestedLines.push('() => {');

      // Cache refs for nested elements
      for (const id of nestedIds) {
        nestedLines.push(`      const ${id} = r.getElementById('${id}');`);
      }

      nestedLines.push('      return [');
      for (const binding of nestedBindings) {
        nestedLines.push(`        ${generateSingleBindingCode(binding, true)},`);
      }
      nestedLines.push('      ];');
      nestedLines.push('    }');
      nestedCode = nestedLines.join('\n');
    }

    lines.push(`    ${BIND_FN.IF}(r, this.${cond.signalName}, '${cond.id}', \`${escapedTemplate}\`, ${nestedCode});`);
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
  let idCounter = 0;
  let lastProcessedTemplateContent = '';
  let hasConditionals = false;

  for (const templateInfo of htmlTemplates) {
    let templateContent = extractTemplateContent(templateInfo.node.template, sourceFile);

    const result = processHtmlTemplateWithConditionals(templateContent, signalInitializers, idCounter);
    templateContent = result.processedContent;
    allBindings = [...allBindings, ...result.bindings];
    allConditionals = [...allConditionals, ...result.conditionals];
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
  const initBindingsFunction = generateInitBindingsFunction(allBindings, allConditionals);

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
  const hasAnyBindings = allBindings.length > 0 || allConditionals.length > 0;
  if (hasAnyBindings && servicesImport) {
    const requiredFunctions: string[] = [];
    if (allBindings.some((b) => b.type === 'style')) requiredFunctions.push(BIND_FN.STYLE);
    if (allBindings.some((b) => b.type === 'attr')) requiredFunctions.push(BIND_FN.ATTR);
    if (allBindings.some((b) => b.type === 'text')) requiredFunctions.push(BIND_FN.TEXT);
    if (hasConditionals) requiredFunctions.push(BIND_FN.IF);

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
