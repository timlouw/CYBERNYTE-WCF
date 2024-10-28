type LowercaseString = `${Lowercase<string>}`;
type ValidComponentName = `${LowercaseString}-${LowercaseString}`;

interface CreateComponentConfig {
  name: ValidComponentName;
  clickDetection?: boolean;
}

interface InputComponent {
  new (...params: any[]): HTMLElement;
}

export abstract class Component extends HTMLElement {
  abstract render: () => string;
  abstract styles: () => string;
}

const stylesMap = new Map<string, CSSStyleSheet>();

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

          this.shadowRoot.innerHTML = this.render();
        }
      }

      render() {
        return /*html*/``;
      }

      styles() {
        return /*html*/``;
      }
    },
  );
  return config.name;
};
