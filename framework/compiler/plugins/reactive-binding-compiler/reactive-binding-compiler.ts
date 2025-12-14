/**
 * Reactive Binding Compiler Plugin
 *
 * Transforms signal expressions in templates into efficient DOM bindings.
 * Generates static templates and binding initialization code.
 *
 * @example
 * // Before: html`<span>${this.count()}</span>`
 * // After:  static template with `<span id="r0">0</span>`
 * //         + initializeBindings() { __bindText(this.shadowRoot, this.count, 'r0'); }
 */
import fs from 'fs';
import { Plugin } from 'esbuild';
import ts from 'typescript';
import type { ReactiveBinding, SignalExpression, TemplateEdit, ImportInfo, TemplateInfo } from '../../types.js';
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

const NAME = PLUGIN_NAME.REACTIVE;

/**
 * Find import declarations that import from shadow-dom (Component, registerComponent).
 * These imports will be updated to include bind functions from dom/index.
 *
 * @example
 * // INPUT:
 * import { Component, registerComponent } from '../framework/runtime/dom/shadow-dom.js';
 *
 * // Will be updated to:
 * import { Component, registerComponent, __bindText, __bindStyle } from '../framework/runtime/dom/index.js';
 */
const findServicesImport = (sourceFile: ts.SourceFile): ImportInfo | null => {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;

      // Match paths ending with shadow-dom.js or dom/index.js (framework DOM imports)
      if (specifier.includes('shadow-dom') || specifier.includes('dom/index')) {
        const namedImports: string[] = [];

        if (statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
          for (const element of statement.importClause.namedBindings.elements) {
            namedImports.push(element.name.text);
          }
        }

        // Detect quote character from source
        const fullText = statement.moduleSpecifier.getFullText(sourceFile);
        const quoteChar = fullText.includes("'") ? "'" : '"';

        // If importing from shadow-dom.js, redirect to dom/index.js which exports all bind functions
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
 *
 * @example
 * // INPUT:
 * html`<div>${this.count()}</div>`
 *
 * // Returns:
 * // [{
 * //   expressions: [{ signalName: 'count', fullExpression: 'this.count()', ... }],
 * //   templateStart: 0,
 * //   templateEnd: 28
 * // }]
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
// HTML Template Processing
// ============================================================================

/**
 * Determines the binding type based on the context before the expression in HTML
 */
const determineBindingType = (beforeExpr: string): { propertyType: 'style' | 'attribute' | 'innerText'; property?: string } => {
  // Check if it's a style property: style="property: ${...}"
  const styleMatch = beforeExpr.match(/style\s*=\s*["'][^"']*?([\w-]+)\s*:\s*$/);
  if (styleMatch) {
    return { propertyType: 'style', property: styleMatch[1] };
  }

  // Check if it's an attribute: attribute="${...}"
  const attrMatch = beforeExpr.match(/([\w-]+)\s*=\s*["']$/);
  if (attrMatch) {
    return { propertyType: 'attribute', property: attrMatch[1] };
  }

  // Default to innerText (content between tags)
  return { propertyType: 'innerText' };
};

/**
 * Find the enclosing element for an expression and determine where to inject ID
 */
const findEnclosingElement = (htmlContent: string, exprPosition: number): { tagStart: number; tagNameEnd: number; tagName: string } | null => {
  // Find all opening tags before the expression position
  const tagRegex = /<(\w[\w-]*)\s*/g;
  let lastUnclosedTag: { tagStart: number; tagNameEnd: number; tagName: string } | null = null;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(htmlContent)) !== null) {
    if (match.index >= exprPosition) break;

    const tagName = match[1];
    const tagStart = match.index;
    const tagNameEnd = match.index + 1 + tagName.length; // After "<tagName"

    // Check if this tag is closed before our expression
    const afterTag = htmlContent.substring(tagNameEnd, exprPosition);
    const closingTagPattern = new RegExp(`</${tagName}\\s*>`, 'i');

    if (!closingTagPattern.test(afterTag)) {
      lastUnclosedTag = { tagStart, tagNameEnd, tagName };
    }
  }

  return lastUnclosedTag;
};

/**
 * Process HTML template content and generate bindings
 */
const processHtmlTemplate = (
  templateContent: string,
  signalInitializers: Map<string, string | number | boolean>,
  startingId: number,
): { processedContent: string; bindings: ReactiveBinding[]; nextId: number } => {
  const bindings: ReactiveBinding[] = [];
  let idCounter = startingId;

  // Find all ${this.signalName()} expressions
  const exprRegex = /\$\{(this\.(\w+)\(\))\}/g;
  const edits: TemplateEdit[] = [];
  const idInsertions: Map<number, string> = new Map();
  let match: RegExpExecArray | null;

  while ((match = exprRegex.exec(templateContent)) !== null) {
    const fullExpr = match[0];
    const signalName = match[2];
    const exprStart = match.index;
    const exprEnd = exprStart + fullExpr.length;

    const initialValue = signalInitializers.get(signalName);
    const beforeExpr = templateContent.substring(0, exprStart);

    // Find enclosing element
    const enclosingElement = findEnclosingElement(templateContent, exprStart);

    if (enclosingElement) {
      const elementId = `r${idCounter}`;
      const { propertyType, property } = determineBindingType(beforeExpr);

      // Check if we already have an ID insertion for this position
      if (!idInsertions.has(enclosingElement.tagNameEnd)) {
        idInsertions.set(enclosingElement.tagNameEnd, elementId);
      }

      bindings.push({
        signalName,
        elementSelector: idInsertions.get(enclosingElement.tagNameEnd)!,
        propertyType,
        property,
      });

      idCounter++;
    }

    // Add edit to remove or replace the expression
    if (initialValue !== undefined) {
      edits.push({ type: 'replace', start: exprStart, end: exprEnd, content: String(initialValue) });
    } else {
      edits.push({ type: 'remove', start: exprStart, end: exprEnd });
    }
  }

  // Add ID insertion edits
  for (const [position, elementId] of idInsertions) {
    edits.push({ type: 'insertId', start: position, end: position, elementId });
  }

  // Apply edits in reverse order to maintain positions
  edits.sort((a, b) => b.start - a.start);

  let result = templateContent;
  const processedPositions = new Set<number>();

  for (const edit of edits) {
    if (edit.type === 'remove') {
      result = result.substring(0, edit.start) + result.substring(edit.end);
    } else if (edit.type === 'replace') {
      result = result.substring(0, edit.start) + edit.content! + result.substring(edit.end);
    } else if (edit.type === 'insertId' && !processedPositions.has(edit.start)) {
      // Check if there's already an id attribute
      const afterPosition = result.substring(edit.start);
      const nextCloseBracket = afterPosition.indexOf('>');
      const tagContent = afterPosition.substring(0, nextCloseBracket);

      if (!tagContent.includes(' id="r')) {
        result = result.substring(0, edit.start) + ` id="${edit.elementId}"` + result.substring(edit.start);
        processedPositions.add(edit.start);
      }
    }
  }

  return { processedContent: result, bindings, nextId: idCounter };
};

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generates the compiled bindings code that will be injected
 */
const generateBindingsCode = (bindings: ReactiveBinding[]): string => {
  if (bindings.length === 0) return '';

  return bindings
    .map((binding) => {
      if (binding.propertyType === 'style') {
        const prop = toCamelCase(binding.property!);
        return `    ${BIND_FN.STYLE}(this.shadowRoot,this.${binding.signalName},'${binding.elementSelector}','${prop}');`;
      } else if (binding.propertyType === 'attribute') {
        return `    ${BIND_FN.ATTR}(this.shadowRoot,this.${binding.signalName},'${binding.elementSelector}','${binding.property}');`;
      } else {
        return `    ${BIND_FN.TEXT}(this.shadowRoot,this.${binding.signalName},'${binding.elementSelector}');`;
      }
    })
    .join('\n');
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
 * Generate initializeBindings function
 */
const generateInitBindingsFunction = (bindingsCode: string): string => {
  if (bindingsCode) {
    return `\n\n  initializeBindings = () => {\n    // Auto-generated reactive bindings\n${bindingsCode}\n  };`;
  }
  return `\n\n  initializeBindings = () => {};`;
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
 *
 * ## Transformation Example:
 * ```typescript
 * // INPUT:
 * class MyComponent extends Component {
 *   count = signal(0);
 *   render = () => html`<div>${this.count()}</div>`;
 * }
 *
 * // OUTPUT:
 * class MyComponent extends Component {
 *   static template = (() => { const t = document.createElement('template'); t.innerHTML = `<div id="r0">0</div>`; return t; })();
 *   initializeBindings = () => {
 *     __bindText(this.shadowRoot, this.count, 'r0');
 *   };
 *   count = signal(0);
 *   render = () => ``;
 * }
 * ```
 */
const transformComponentSource = (source: string, filePath: string): string | null => {
  // Parse source with TypeScript (use cache)
  const sourceFile = sourceCache.parse(filePath, source);

  // Find component class
  const componentClass = findComponentClass(sourceFile);
  if (!componentClass) {
    return null;
  }

  // Find signal initializers (uses shared utility H3)
  const signalInitializers = findSignalInitializers(sourceFile);

  // Find services import (using AST)
  const servicesImport = findServicesImport(sourceFile);

  // Find html templates
  const htmlTemplates = findHtmlTemplates(sourceFile);

  // Collect all edits to apply
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  const allBindings: ReactiveBinding[] = [];
  let idCounter = 0;
  let lastProcessedTemplateContent = '';

  // Process each html template (B5 - simplified using extractTemplateContent)
  for (const templateInfo of htmlTemplates) {
    let templateContent = extractTemplateContent(templateInfo.node.template, sourceFile);

    // Process template if we have signal expressions
    if (templateInfo.expressions.length > 0) {
      const result = processHtmlTemplate(templateContent, signalInitializers, idCounter);
      templateContent = result.processedContent;
      allBindings.push(...result.bindings);
      idCounter = result.nextId;
    }

    lastProcessedTemplateContent = templateContent;

    // Replace html`...` with ``
    edits.push({
      start: templateInfo.templateStart,
      end: templateInfo.templateEnd,
      replacement: '``',
    });
  }

  // Process css template literals (replace css`...` with `...`)
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
  const bindingsCode = generateBindingsCode(allBindings);
  const initBindingsFunction = generateInitBindingsFunction(bindingsCode);

  // Generate static template if we have processed content
  let staticTemplateCode = '';
  if (lastProcessedTemplateContent) {
    staticTemplateCode = generateStaticTemplate(lastProcessedTemplateContent);
  }

  // Find class body start position for injection (handles both empty and non-empty classes)
  let classBodyStart: number | null = null;
  const classStart = componentClass.getStart(sourceFile);
  const classText = componentClass.getText(sourceFile);
  const braceIndex = classText.indexOf('{');
  if (braceIndex !== -1) {
    classBodyStart = classStart + braceIndex + 1;
  }

  // Update import if we have bindings
  if (allBindings.length > 0 && servicesImport) {
    const requiredFunctions: string[] = [];
    if (allBindings.some((b) => b.propertyType === 'style')) requiredFunctions.push(BIND_FN.STYLE);
    if (allBindings.some((b) => b.propertyType === 'attribute')) requiredFunctions.push(BIND_FN.ATTR);
    if (allBindings.some((b) => b.propertyType === 'innerText')) requiredFunctions.push(BIND_FN.TEXT);

    if (requiredFunctions.length > 0) {
      const newImport = generateUpdatedImport(servicesImport, requiredFunctions);
      edits.push({
        start: servicesImport.start,
        end: servicesImport.end,
        replacement: newImport,
      });
    }
  }

  // Apply all edits using shared utility (H2)
  let result = applyEdits(source, edits);

  // Inject static template and initBindings into class
  // We do this after other edits since positions change
  if (classBodyStart !== null) {
    const injectedCode = staticTemplateCode + initBindingsFunction;

    // Use regex for this final injection since positions have shifted
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
 * Reactive Binding Plugin - Compiles signal bindings at build time
 *
 * ## What it does:
 * Transforms reactive signal expressions in templates into efficient DOM bindings.
 *
 * ## Transformation Example:
 * ```typescript
 * // INPUT:
 * html`<span style="color: ${this.color()}">${this.count()}</span>`
 *
 * // OUTPUT (template):
 * `<span id="r0" style="color: red">0</span>`
 *
 * // OUTPUT (bindings):
 * __bindStyle(this.shadowRoot, this.color, 'r0', 'color');
 * __bindText(this.shadowRoot, this.count, 'r0');
 * ```
 */
export const ReactiveBindingPlugin: Plugin = {
  name: NAME,
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      // Skip non-source folders (D2 - early returns)
      if (args.path.includes('scripts') || args.path.includes('node_modules')) {
        return undefined;
      }

      const source = await fs.promises.readFile(args.path, 'utf8');

      // Quick checks before expensive AST parsing (D2)
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
