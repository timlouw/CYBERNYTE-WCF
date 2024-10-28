import fs from 'fs';
import { Plugin } from 'esbuild';

const generateRandomId = (): string => {
  return `id-${Math.random().toString(36).substring(2, 15)}`;
};

export const customElementUniqueIdGeneratorPlugin: Plugin = {
  name: 'element-unique-id-generator-plugin',
  setup(build) {
    let customElements = new Set<string>();

    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');

      // Step 1: Collect custom element names using regex
      const registerComponentRegex = /registerComponent\(\s*{[^}]*name:\s*['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = registerComponentRegex.exec(source)) !== null) {
        console.log(`Found custom element: ${match[1]}`);
        customElements.add(match[1]);
      }

      let modifiedSource = source;

      // Step 2: Inject uniqueID variable at the start of each class
      const classRegex = /class\s+extends\s+Component\s*{/g;
      modifiedSource = modifiedSource.replace(classRegex, (match) => {
        return `${match}\n  uniqueID = this.getAttribute('data-id');\n`;
      });

      // Step 3: Modify HTML inside template literals and process custom elements
      const templateLiteralRegex = /html`([\s\S]*?)`/g;
      let templateMatch: RegExpExecArray | null;

      while ((templateMatch = templateLiteralRegex.exec(modifiedSource)) !== null) {
        let templateContent = templateMatch[1];

        // Step 4: Add unique `data-id` only to custom elements
        customElements.forEach((customElement) => {
          const customElementRegex = new RegExp(`<${customElement}([^>]*)>`, 'g');
          templateContent = templateContent.replace(customElementRegex, (match, attrs) => {
            const randomId = generateRandomId();
            if (!attrs.includes('data-id')) {
              return `<${customElement} ${attrs.trim()} data-id="${randomId}">`;
            }
            return match; // Skip if data-id is already present
          });
        });

        // Replace the original template literal in the source code with the modified one
        const fullMatch = templateMatch[0]; // This includes "html`...`"
        const modifiedTemplateLiteral = `\`${templateContent}\``;
        modifiedSource = modifiedSource.replace(fullMatch, modifiedTemplateLiteral);
      }

      const cssLiteralRegex = /css`([\s\S]*?)`/g;
      let cssMatch: RegExpExecArray | null;

      while ((cssMatch = cssLiteralRegex.exec(modifiedSource)) !== null) {
        let cssContent = cssMatch[1];

        // Replace the original css literal in the source code with the modified one
        const fullMatch = cssMatch[0]; // This includes "css`...`"
        const modifiedTemplateLiteral = `\`${cssContent}\``;
        modifiedSource = modifiedSource.replace(fullMatch, modifiedTemplateLiteral);
      }

      return {
        contents: modifiedSource,
        loader: 'ts',
      };
    });
  },
};
