interface CreateComponentConfig {
  name: string;
  changeDetection?: boolean;
  clickDetection?: boolean;
  fullHeight?: boolean;
}

interface InputComponent {
  new (...params: any[]): HTMLElement;
}

export abstract class Component extends HTMLElement {
  abstract render: () => string;
  abstract styles: () => string;
}

const stylesMap = new Map<string, CSSStyleSheet>();
const domNodeMap = new Map<string, DocumentFragment>();

const generateCacheKey = (name: string, attributes: NamedNodeMap) => {
  const attrs: {[key: string]: string} = {};
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    attrs[attr.name] = attr.value;
  }
  return `${name}-${JSON.stringify(attrs)}`;
}

export const registerComponent = (config: CreateComponentConfig, component: InputComponent): string => {
  window.customElements.define(
    config.name,
    class extends component {
      constructor() {
        super();
        this.createComponent();
      }

      async createComponent() {
        this.attachShadow({ mode: 'open' });
        if (this.shadowRoot) {
          const styleSheet = stylesMap.get(config.name) as CSSStyleSheet;
          if (styleSheet) {
            this.shadowRoot.adoptedStyleSheets = [styleSheet];
          } else {
            const styleSheet = new CSSStyleSheet();
            styleSheet.replaceSync(this.styles());
            this.shadowRoot.adoptedStyleSheets = [styleSheet];
            stylesMap.set(config.name, styleSheet);
          }

          const key = generateCacheKey(config.name, this.attributes);
          let domFragment = domNodeMap.get(key);
          if (!domFragment) {
            const tempContainer = document.createElement('template');
            tempContainer.innerHTML = this.render();
            domFragment = tempContainer.content;
            domNodeMap.set(key, domFragment);
          }
          this.shadowRoot.appendChild(domFragment.cloneNode(true));
        }
      }

      render() {
        return '';
      }
      styles() {
        return '';
      }
    },
  );
  return config.name;
};
