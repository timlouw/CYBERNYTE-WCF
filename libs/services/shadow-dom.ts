import { startShadowDomIfElementListeners } from 'apps/client';

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
  bindClickListeners?: () => void;
}

const stylesMap = new Map<string, CSSStyleSheet>();
const styleSheet = new CSSStyleSheet();

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
          const cachedStyleSheet = stylesMap.get(config.name) as CSSStyleSheet;
          if (cachedStyleSheet) {
            this.shadowRoot.adoptedStyleSheets = [cachedStyleSheet];
          } else {
            styleSheet.replaceSync(this.styles());
            this.shadowRoot.adoptedStyleSheets = [styleSheet];
            stylesMap.set(config.name, styleSheet);
          }

          this.shadowRoot.innerHTML = this.render();

          // if (config.changeDetection) {
          //   startShadowDomIfElementListeners(this.shadowRoot);
          // }

          // if (this.bindClickListeners && config.clickDetection) {
          //   this.bindClickListeners();
          // }
        }
      }

      render() {
        return html``;
      }
      styles() {
        return '';
      }
      bindClickListeners() {}
    },
  );
  return config.name;
};
