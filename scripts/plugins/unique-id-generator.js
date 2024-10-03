const fs = require('fs');

const customElementUniqueIdGeneratorPlugin = {
  name: 'element-unique-id-generator-plugin',
  setup(build) {
    let customElements = new Set();

    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');

      // Step 1: Collect custom element names
      const registerComponentRegex = /registerComponent\(\s*{[^}]*name:\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = registerComponentRegex.exec(source)) !== null) {
        customElements.add(match[1]);
      }

      let modifiedSource = source;

      // Step 2: Inject uniqueID variable at the start of each class
      const classRegex = /class\s+extends\s+Component\s*{/g;
      modifiedSource = modifiedSource.replace(classRegex, (match) => {
        return `${match}\n  uniqueID = this.getAttribute('data-id');\n`;
      });

      // Step 3: Modify HTML inside template literals and process custom elements and @click events
      const templateLiteralRegex = /html`([\s\S]*?)`/g;
      let templateMatch;
      let clickListeners = [];

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

        // Step 5: Check for @click events and replace them with `click-id`
        const clickEventRegex = /@click="([^"]+)"/g;
        let clickMatch;
        let clickCounter = 0;

        while ((clickMatch = clickEventRegex.exec(templateContent)) !== null) {
          clickCounter++;
          const uniqueClickId = '${this.uniqueID}-click-' + clickCounter;
          const handler = clickMatch[1].trim().slice(2, -1);
          clickListeners.push({ clickId: uniqueClickId, handler: handler });
          templateContent = templateContent.replace(clickMatch[0], 'click-id="' + uniqueClickId + '"');
        }

        // Replace the original template literal in the source code with the modified one
        modifiedSource = modifiedSource.replace(templateMatch[1], templateContent);
      }

      const classTwoRegex = /class\s+extends\s+Component\s*{/g;
      console.log("args.path", args.path)
      modifiedSource = modifiedSource.replace(classTwoRegex, (match) => {
        const bindListenersFunction = `
          bindClickListeners = () => {
            ${clickListeners.map((listener, counter) => {
              return `
                const element${counter} = this.shadowRoot.querySelector(\`[click-id="${listener.clickId}"]\`);
                if (element${counter}) {
                  element${counter}.addEventListener('click', ${listener.handler});
                }
              `.trim();
            }).join('\n')}
          };
        `;

        return `
          ${match}\n
          ${bindListenersFunction}
          ;\n
        `;
      });

      return {
        contents: modifiedSource,
        loader: 'ts',
      };
    });
  },
};

const generateRandomId = () => {
  return `id-${Math.random().toString(36).substring(2, 15)}`;
};

module.exports = customElementUniqueIdGeneratorPlugin;
