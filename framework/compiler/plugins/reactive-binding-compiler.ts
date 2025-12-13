import fs from 'fs';
import { Plugin } from 'esbuild';
import ts from 'typescript';
import type { ReactiveBinding, SignalExpression, TemplateEdit, ImportInfo } from '../types.js';
import { findClassExtending, applySourceEdits } from '../utils/index.js';

// ============================================================================
// AST Utilities
// ============================================================================

/**
 * Check if a call expression is a signal call: signal(...)
 */
const isSignalCall = (node: ts.CallExpression): boolean => {
  return ts.isIdentifier(node.expression) && node.expression.text === 'signal';
};

/**
 * Check if a call expression is a signal getter: this.signalName()
 */
const isSignalGetter = (node: ts.CallExpression, sourceFile: ts.SourceFile): string | null => {
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    ts.isIdentifier(node.expression.name) &&
    node.arguments.length === 0
  ) {
    return node.expression.name.text;
  }
  return null;
};

/**
 * Extract static value from signal initializer if possible
 */
const extractStaticValue = (arg: ts.Expression): string | number | boolean | null => {
  if (ts.isStringLiteral(arg)) {
    return arg.text;
  }
  if (ts.isNumericLiteral(arg)) {
    return Number(arg.text);
  }
  if (arg.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (arg.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  // Simple string concatenation: "a" + "b"
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = extractStaticValue(arg.left);
    const right = extractStaticValue(arg.right);
    if (typeof left === 'string' && typeof right === 'string') {
      return left + right;
    }
  }
  return null;
};

/**
 * Find all signal property declarations and their initial values
 */
const findSignalInitializers = (sourceFile: ts.SourceFile): Map<string, string | number | boolean> => {
  const initializers = new Map<string, string | number | boolean>();

  const visit = (node: ts.Node) => {
    if (ts.isPropertyDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && isSignalCall(node.initializer)) {
      const args = node.initializer.arguments;
      if (args.length > 0) {
        const value = extractStaticValue(args[0]);
        if (value !== null) {
          initializers.set(node.name.text, value);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializers;
};

/**
 * Find import declarations that import from shadow-dom (Component, registerComponent)
 * These imports will be updated to include bind functions from dom/index
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
 * Find all html tagged template literals and extract signal expressions
 */
const findHtmlTemplates = (
  sourceFile: ts.SourceFile,
): Array<{
  node: ts.TaggedTemplateExpression;
  expressions: SignalExpression[];
  templateStart: number;
  templateEnd: number;
}> => {
  const templates: Array<{
    node: ts.TaggedTemplateExpression;
    expressions: SignalExpression[];
    templateStart: number;
    templateEnd: number;
  }> = [];

  const visit = (node: ts.Node) => {
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'html') {
      const template = node.template;
      const expressions: SignalExpression[] = [];

      if (ts.isTemplateExpression(template)) {
        for (const span of template.templateSpans) {
          if (ts.isCallExpression(span.expression)) {
            const signalName = isSignalGetter(span.expression, sourceFile);
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

/**
 * Find the class that extends Component
 */
const findComponentClass = (sourceFile: ts.SourceFile): ts.ClassExpression | ts.ClassDeclaration | null => {
  return findClassExtending(sourceFile, 'Component');
};

// ============================================================================
// HTML Template Processing
// ============================================================================

/**
 * Converts CSS property name to camelCase for direct style property access
 * e.g., "background-color" -> "backgroundColor"
 */
const toCamelCase = (str: string): string => {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

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
        return `    __bindStyle(this.shadowRoot,this.${binding.signalName},'${binding.elementSelector}','${prop}');`;
      } else if (binding.propertyType === 'attribute') {
        return `    __bindAttr(this.shadowRoot,this.${binding.signalName},'${binding.elementSelector}','${binding.property}');`;
      } else {
        return `    __bindText(this.shadowRoot,this.${binding.signalName},'${binding.elementSelector}');`;
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
 * Process the source file and return transformed source
 */
const transformComponentSource = (source: string, filePath: string): string | null => {
  // Parse source with TypeScript
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Find component class
  const componentClass = findComponentClass(sourceFile);
  if (!componentClass) {
    return null;
  }

  // Find signal initializers
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

  // Process each html template
  for (const templateInfo of htmlTemplates) {
    const template = templateInfo.node.template;
    let templateContent = '';

    // Extract raw template content
    if (ts.isNoSubstitutionTemplateLiteral(template)) {
      templateContent = template.text;
    } else if (ts.isTemplateExpression(template)) {
      // Reconstruct the template content from parts
      templateContent = template.head.text;
      for (const span of template.templateSpans) {
        templateContent += '${' + span.expression.getText(sourceFile) + '}';
        templateContent += span.literal.text;
      }
    }

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
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'css') {
      const template = node.template;
      let cssContent = '';

      if (ts.isNoSubstitutionTemplateLiteral(template)) {
        cssContent = template.text;
      } else if (ts.isTemplateExpression(template)) {
        cssContent = template.head.text;
        for (const span of template.templateSpans) {
          cssContent += '${' + span.expression.getText(sourceFile) + '}';
          cssContent += span.literal.text;
        }
      }

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

  // Find class body start position for injection
  let classBodyStart: number | null = null;
  if (componentClass.members && componentClass.members.length > 0) {
    // Find opening brace position
    const classStart = componentClass.getStart(sourceFile);
    const classText = componentClass.getText(sourceFile);
    const braceIndex = classText.indexOf('{');
    if (braceIndex !== -1) {
      classBodyStart = classStart + braceIndex + 1;
    }
  }

  // Update import if we have bindings
  if (allBindings.length > 0 && servicesImport) {
    const requiredFunctions: string[] = [];
    if (allBindings.some((b) => b.propertyType === 'style')) requiredFunctions.push('__bindStyle');
    if (allBindings.some((b) => b.propertyType === 'attribute')) requiredFunctions.push('__bindAttr');
    if (allBindings.some((b) => b.propertyType === 'innerText')) requiredFunctions.push('__bindText');

    if (requiredFunctions.length > 0) {
      const newImport = generateUpdatedImport(servicesImport, requiredFunctions);
      edits.push({
        start: servicesImport.start,
        end: servicesImport.end,
        replacement: newImport,
      });
    }
  }

  // Apply all edits
  let result = applySourceEdits(source, edits);

  // Inject static template and initBindings into class
  // We do this after other edits since positions change
  if (classBodyStart !== null) {
    // Re-parse to get accurate positions after edits
    const injectedCode = staticTemplateCode + initBindingsFunction;

    // Use regex for this final injection since positions have shifted
    result = result.replace(/class\s+extends\s+Component\s*\{/, (match) => {
      return match + injectedCode;
    });
  }

  // Replace any remaining html` with just `
  result = result.replace(/html`/g, '`');

  return result;
};

// ============================================================================
// Plugin Export
// ============================================================================

/**
 * Main plugin that compiles reactive bindings at build time
 * Uses TypeScript AST for reliable source analysis and transformation
 */
export const ReactiveBindingPlugin: Plugin = {
  name: 'reactive-binding-plugin',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      // Skip scripts folder
      if (args.path.includes('scripts')) {
        return undefined;
      }

      const source = await fs.promises.readFile(args.path, 'utf8');

      // Quick check if this file has Component class and html template
      if (!source.includes('extends Component') || !source.includes('html`')) {
        return undefined;
      }

      const transformed = transformComponentSource(source, args.path);

      if (transformed === null) {
        return undefined;
      }

      return {
        contents: transformed,
        loader: 'ts',
      };
    });
  },
};
