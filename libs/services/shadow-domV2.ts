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

      createComponent() {
        this.attachShadow({ mode: 'open' });
        if (this.shadowRoot) {
          let styleSheet = stylesMap.get(config.name) as CSSStyleSheet;
          if (!styleSheet) {
            styleSheet = new CSSStyleSheet();
            styleSheet.replaceSync(this.styles());
            stylesMap.set(config.name, styleSheet);
          }

          this.shadowRoot.adoptedStyleSheets = [styleSheet];
          this.shadowRoot.innerHTML = this.render();
        }
      }

      render() {
        return html``;
      }

      styles() {
        return css``;
      }
    },
  );
  return config.name;
};
