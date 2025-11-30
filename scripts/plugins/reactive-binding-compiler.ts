import fs from 'fs';
import { Plugin } from 'esbuild';
import ts from 'typescript';

interface ReactiveBinding {
  signalName: string;
  elementSelector: string;
  propertyType: 'style' | 'attribute' | 'innerText';
  property?: string;
}

interface ParsedBinding {
  signalExpression: string;
  signalName: string;
}

/**
 * Generates a random unique ID for elements
 */
const generateRandomId = (): string => {
  return `id-${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Extracts signal name from an expression like "this.color()" or "this.text()"
 */
const extractSignalName = (expression: string): string | null => {
  // Match patterns like: this.signalName() or this.signalName
  const match = expression.match(/this\.(\w+)\s*\(\s*\)/);
  return match ? match[1] : null;
};

/**
 * Determines the binding type based on context in the HTML
 */
const determineBindingType = (beforeExpr: string, _afterExpr: string): { propertyType: 'style' | 'attribute' | 'innerText'; property?: string } => {
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
 * Uses TypeScript AST to find template expressions within html tagged template literals
 */
const findReactiveExpressionsInRender = (sourceFile: ts.SourceFile): { expressions: ParsedBinding[]; renderNode: ts.MethodDeclaration | ts.PropertyDeclaration | null } => {
  const expressions: ParsedBinding[] = [];
  let renderNode: ts.MethodDeclaration | ts.PropertyDeclaration | null = null;

  const visit = (node: ts.Node) => {
    // Find the render method/property
    if ((ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) && node.name && ts.isIdentifier(node.name) && node.name.text === 'render') {
      renderNode = node;
    }

    // Find tagged template expressions with 'html' tag
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag;
      if (ts.isIdentifier(tag) && tag.text === 'html') {
        const template = node.template;

        if (ts.isTemplateExpression(template)) {
          // Process each template span (the ${...} parts)
          template.templateSpans.forEach((span) => {
            const expr = span.expression;
            const exprText = expr.getText(sourceFile);

            // Check if this is a signal call (this.signalName())
            const signalName = extractSignalName(exprText);
            if (signalName) {
              expressions.push({
                signalExpression: exprText,
                signalName: signalName,
              });
            }
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { expressions, renderNode };
};

/**
 * Finds signal initializers that are static literals or simple binary expressions
 */
const findSignalInitializers = (sourceFile: ts.SourceFile): Map<string, string | number | boolean> => {
  const initializers = new Map<string, string | number | boolean>();

  const visit = (node: ts.Node) => {
    if (ts.isPropertyDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === 'signal') {
        const args = node.initializer.arguments;
        if (args.length > 0) {
          const arg = args[0];
          if (ts.isStringLiteral(arg)) {
            initializers.set(node.name.text, arg.text);
          } else if (ts.isNumericLiteral(arg)) {
            initializers.set(node.name.text, Number(arg.text));
          } else if (arg.kind === ts.SyntaxKind.TrueKeyword) {
            initializers.set(node.name.text, true);
          } else if (arg.kind === ts.SyntaxKind.FalseKeyword) {
            initializers.set(node.name.text, false);
          } else if (ts.isBinaryExpression(arg)) {
            // Simple concatenation support
            const left = arg.left;
            const right = arg.right;
            if (ts.isStringLiteral(left) && ts.isStringLiteral(right) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
              initializers.set(node.name.text, left.text + right.text);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializers;
};

/**
 * Converts CSS property name to camelCase for direct style property access
 * e.g., "background-color" -> "backgroundColor"
 */
const toCamelCase = (str: string): string => {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Generates the compiled bindings code that will be injected
 * Uses specialized binding functions - no runtime type checks
 */
const generateBindingsCode = (bindings: ReactiveBinding[]): string => {
  if (bindings.length === 0) return '';

  const bindingCalls = bindings
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

  return bindingCalls;
};

/**
 * Main plugin that compiles reactive bindings at build time
 * Also handles unique ID generation for custom elements (merged from unique-id-generator)
 */
export const reactiveBindingCompilerPlugin: Plugin = {
  name: 'reactive-binding-compiler-plugin',
  setup(build) {
    const customElements = new Set<string>();

    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      // Skip scripts folder
      if (args.path.includes('scripts')) {
        return undefined;
      }

      const source = await fs.promises.readFile(args.path, 'utf8');

      // Collect custom element names
      const registerComponentRegex = /registerComponent\(\s*{[^}]*selector:\s*['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = registerComponentRegex.exec(source)) !== null) {
        customElements.add(match[1]);
      }

      // Quick check if this file has Component class and html template
      if (!source.includes('extends Component') || !source.includes('html`')) {
        return undefined;
      }

      let modifiedSource = source;

      // Inject uniqueID variable at the start of each class (from unique-id-generator)
      const classRegex = /class\s+extends\s+Component\s*{/g;
      modifiedSource = modifiedSource.replace(classRegex, (match) => {
        return `${match}\n  uniqueID = this.getAttribute('data-id');\n`;
      });

      // Parse the source using TypeScript AST to find reactive expressions
      const sourceFile = ts.createSourceFile(args.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const { expressions } = findReactiveExpressionsInRender(sourceFile);
      const signalInitializers = findSignalInitializers(sourceFile);

      // Process html template literals
      const htmlTemplateRegex = /html`([\s\S]*?)`/g;
      let htmlMatch: RegExpExecArray | null;
      const allBindings: ReactiveBinding[] = [];
      let reactiveIdCounter = 0;
      let extractedTemplateContent = '';

      // We need to process all html templates - reset the regex
      htmlTemplateRegex.lastIndex = 0;

      while ((htmlMatch = htmlTemplateRegex.exec(modifiedSource)) !== null) {
        let templateContent = htmlMatch[1];
        const originalTemplate = htmlMatch[0];

        // Only process reactive bindings if we found expressions
        if (expressions.length > 0) {
          const exprRegex = /\$\{(this\.(\w+)\(\))\}/g;
          let exprMatch: RegExpExecArray | null;

          // Track edits: insertions and removals
          const edits: { type: 'insert' | 'remove' | 'replace'; position: number; content?: string; length?: number; id?: number }[] = [];

          while ((exprMatch = exprRegex.exec(templateContent)) !== null) {
            const fullExpr = exprMatch[0];
            const signalName = exprMatch[2];
            const exprStart = exprMatch.index;

            const initialValue = signalInitializers.get(signalName);

            if (initialValue !== undefined) {
              // Replace with initial value
              edits.push({ type: 'replace', position: exprStart, length: fullExpr.length, content: String(initialValue) });
            } else {
              // Add removal of the expression
              edits.push({ type: 'remove', position: exprStart, length: fullExpr.length });
            }

            // Determine context: is this in a style, attribute, or text content?
            const beforeExpr = templateContent.substring(0, exprStart);
            const afterExpr = templateContent.substring(exprStart + fullExpr.length);

            // Find the element this expression belongs to
            // Look backwards for the most recent unclosed tag
            const tagOpenRegex = /<(\w+)([^>]*?)(?:>|$)/g;
            let lastTagMatch: RegExpExecArray | null = null;
            let tagMatch: RegExpExecArray | null;

            while ((tagMatch = tagOpenRegex.exec(beforeExpr)) !== null) {
              // Check if this tag is closed before our expression
              const tagName = tagMatch[1];
              const afterTag = beforeExpr.substring(tagMatch.index + tagMatch[0].length);
              const closingTag = new RegExp(`</${tagName}>`);
              if (!closingTag.test(afterTag)) {
                lastTagMatch = tagMatch;
              }
            }

            if (lastTagMatch) {
              const { propertyType, property } = determineBindingType(beforeExpr, afterExpr);

              edits.push({
                type: 'insert',
                position: lastTagMatch.index + lastTagMatch[1].length + 1, // After "<tagname"
                id: reactiveIdCounter,
              });

              const elementId = `r${reactiveIdCounter}`;
              allBindings.push({
                signalName,
                elementSelector: elementId,
                propertyType,
                property,
              });

              reactiveIdCounter++;
            }
          }

          // Apply edits in reverse order to maintain positions
          edits.sort((a, b) => b.position - a.position);

          const processedPositions = new Set<number>();

          for (const edit of edits) {
            if (edit.type === 'remove') {
              const before = templateContent.substring(0, edit.position);
              const after = templateContent.substring(edit.position + edit.length!);
              templateContent = before + after;
            } else if (edit.type === 'replace') {
              const before = templateContent.substring(0, edit.position);
              const after = templateContent.substring(edit.position + edit.length!);
              templateContent = before + edit.content! + after;
            } else if (edit.type === 'insert') {
              const beforeInsertion = templateContent.substring(0, edit.position);
              const afterInsertion = templateContent.substring(edit.position);

              const nextCloseBracket = afterInsertion.indexOf('>');
              const tagContent = afterInsertion.substring(0, nextCloseBracket);

              if (!tagContent.includes(' id="r') && !processedPositions.has(edit.position)) {
                templateContent = beforeInsertion + ` id="r${edit.id}"` + afterInsertion;
                processedPositions.add(edit.position);
              }
            }
          }
        }

        // Add unique data-id to custom elements (from unique-id-generator)
        customElements.forEach((customElement) => {
          const customElementRegex = new RegExp(`<${customElement}([^>]*)>`, 'g');
          templateContent = templateContent.replace(customElementRegex, (match, attrs) => {
            if (!attrs.includes('data-id')) {
              return `<${customElement} ${attrs.trim()} data-id="${generateRandomId()}">`;
            }
            return match;
          });
        });

        extractedTemplateContent = templateContent;

        // Replace the original template with empty string
        modifiedSource = modifiedSource.replace(originalTemplate, '``');
      }

      // Inject static template
      if (extractedTemplateContent) {
        // Escape backticks in the content
        const escapedContent = extractedTemplateContent.replace(/`/g, '\\`');
        const staticTemplateCode = `
  static template = (() => {
    const t = document.createElement('template');
    t.innerHTML = \`${escapedContent}\`;
    return t;
  })();
`;
        const classBodyRegex = /class\s+extends\s+Component\s*{/g;
        modifiedSource = modifiedSource.replace(classBodyRegex, (match) => {
          return `${match}${staticTemplateCode}`;
        });
      }

      // Process css template literals (from unique-id-generator)
      const cssLiteralRegex = /css`([\s\S]*?)`/g;
      let cssMatch: RegExpExecArray | null;

      while ((cssMatch = cssLiteralRegex.exec(modifiedSource)) !== null) {
        const cssContent = cssMatch[1];
        const fullMatch = cssMatch[0];
        const modifiedTemplateLiteral = `\`${cssContent}\``;
        modifiedSource = modifiedSource.replace(fullMatch, modifiedTemplateLiteral);
      }

      // Replace html` with just ` (template literal)
      modifiedSource = modifiedSource.replace(/html`/g, '`');

      // Generate the initializeBindings function with reactive bindings
      const bindingsCode = allBindings.length > 0 ? generateBindingsCode(allBindings) : '';

      // Add the imports for binding functions if we have bindings
      if (allBindings.length > 0) {
        const importRegex = /import\s*{([^}]+)}\s*from\s*['"]@services['"]/;
        const importMatch = importRegex.exec(modifiedSource);

        if (importMatch) {
          const existingImports = importMatch[1];
          // Determine which binding functions are needed
          const needsStyle = allBindings.some((b) => b.propertyType === 'style');
          const needsAttr = allBindings.some((b) => b.propertyType === 'attribute');
          const needsText = allBindings.some((b) => b.propertyType === 'innerText');

          const bindImports = [needsStyle ? '__bindStyle' : '', needsAttr ? '__bindAttr' : '', needsText ? '__bindText' : ''].filter(Boolean).join(', ');

          if (bindImports) {
            modifiedSource = modifiedSource.replace(importMatch[0], `import {${existingImports}, ${bindImports} } from '@services'`);
          }
        }
      }

      // Inject the entire initializeBindings function into the class
      const initBindingsFunction = bindingsCode
        ? `\n\n  initializeBindings = () => {\n    // Auto-generated reactive bindings\n${bindingsCode}\n  };`
        : `\n\n  initializeBindings = () => {};`;

      const classBodyRegex = /class\s+extends\s+Component\s*{/g;
      modifiedSource = modifiedSource.replace(classBodyRegex, (match) => {
        return `${match}${initBindingsFunction}`;
      });

      return {
        contents: modifiedSource,
        loader: 'ts',
      };
    });
  },
};
