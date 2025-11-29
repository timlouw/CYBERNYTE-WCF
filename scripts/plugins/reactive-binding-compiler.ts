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
 * Generates the compiled bindings code that will be injected
 */
const generateBindingsCode = (bindings: ReactiveBinding[]): string => {
  if (bindings.length === 0) return '';

  const bindingCalls = bindings
    .map((binding) => {
      const propertyArg = binding.property ? `, '${binding.property}'` : '';
      return `    __activateBinding(this.shadowRoot, this.${binding.signalName}, '${binding.elementSelector}', '${binding.propertyType}'${propertyArg});`;
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

      // Process html template literals
      const htmlTemplateRegex = /html`([\s\S]*?)`/g;
      let htmlMatch: RegExpExecArray | null;
      const allBindings: ReactiveBinding[] = [];
      let reactiveIdCounter = 0;

      // We need to process all html templates - reset the regex
      htmlTemplateRegex.lastIndex = 0;

      while ((htmlMatch = htmlTemplateRegex.exec(modifiedSource)) !== null) {
        let templateContent = htmlMatch[1];
        const originalTemplate = htmlMatch[0];

        // Only process reactive bindings if we found expressions
        if (expressions.length > 0) {
          // Find all ${this.signalName()} patterns and their context
          const exprRegex = /\$\{(this\.(\w+)\(\))\}/g;
          let exprMatch: RegExpExecArray | null;

          // We need to track positions to insert data-reactive-id
          const insertions: { position: number; id: number; signalName: string; context: string }[] = [];

          while ((exprMatch = exprRegex.exec(templateContent)) !== null) {
            const fullExpr = exprMatch[0];
            const signalName = exprMatch[2];
            const exprStart = exprMatch.index;

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

              insertions.push({
                position: lastTagMatch.index + lastTagMatch[1].length + 1, // After "<tagname"
                id: reactiveIdCounter,
                signalName,
                context: propertyType,
              });

              allBindings.push({
                signalName,
                elementSelector: `[data-reactive-id="${reactiveIdCounter}"]`,
                propertyType,
                property,
              });

              reactiveIdCounter++;
            }
          }

          // Apply insertions in reverse order to maintain positions
          insertions.sort((a, b) => b.position - a.position);

          // Track which elements already have data-reactive-id
          const processedPositions = new Set<number>();

          for (const insertion of insertions) {
            const beforeInsertion = templateContent.substring(0, insertion.position);
            const afterInsertion = templateContent.substring(insertion.position);

            const nextCloseBracket = afterInsertion.indexOf('>');
            const tagContent = afterInsertion.substring(0, nextCloseBracket);

            if (!tagContent.includes('data-reactive-id') && !processedPositions.has(insertion.position)) {
              templateContent = beforeInsertion + ` data-reactive-id="${insertion.id}"` + afterInsertion;
              processedPositions.add(insertion.position);
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

        // Replace the original template with modified one (remove html tag, will be handled by css/html processing below)
        modifiedSource = modifiedSource.replace(originalTemplate, `html\`${templateContent}\``);
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

      // Add the import for __activateBinding if we have bindings
      if (allBindings.length > 0) {
        const importRegex = /import\s*{([^}]+)}\s*from\s*['"]@services['"]/;
        const importMatch = importRegex.exec(modifiedSource);

        if (importMatch) {
          const existingImports = importMatch[1];
          if (!existingImports.includes('__activateBinding')) {
            modifiedSource = modifiedSource.replace(importMatch[0], `import {${existingImports}, __activateBinding } from '@services'`);
          }
        }
      }

      // Inject the entire initializeBindings function into the class
      // Find the class body opening and inject after class properties
      const classBodyRegex = /class\s+extends\s+Component\s*{\s*\n\s*uniqueID[^;]*;/g;
      const classMatch = classBodyRegex.exec(modifiedSource);

      if (classMatch) {
        const insertPos = classMatch.index + classMatch[0].length;
        const initBindingsFunction = bindingsCode
          ? `\n\n  initializeBindings = () => {\n    // Auto-generated reactive bindings\n${bindingsCode}\n  };`
          : `\n\n  initializeBindings = () => {};`;

        modifiedSource = modifiedSource.substring(0, insertPos) + initBindingsFunction + modifiedSource.substring(insertPos);
      }

      return {
        contents: modifiedSource,
        loader: 'ts',
      };
    });
  },
};
