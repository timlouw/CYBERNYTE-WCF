type LowercaseString = `${Lowercase<string>}`;
type ValidComponentName = `${LowercaseString}-${LowercaseString}`;

interface CreateComponentConfig {
  name: ValidComponentName;
}

interface InputComponent {
  new (...params: any[]): HTMLElement;
}

export abstract class Component extends HTMLElement {
  abstract render: () => string;
  abstract styles: () => string;
  abstract initializeBindings: () => void;
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
          this.initializeBindings();
        }
      }

      render() {
        return html``;
      }

      styles() {
        return css``;
      }

      initializeBindings() {}
    },
  );
  return config.name;
};



export const bindReactiveProperty = (shadowRoot: any, reactiveVar: any, selector: any, propertyType: any, property?: any) => {
  const element = shadowRoot.querySelector(selector);

  reactiveVar.subscribe((newValue: any) => {
    if (propertyType === 'style') {
      element.style[property] = newValue;
    } else if (propertyType === 'attribute') {
      element.setAttribute(property, newValue);
    } else if (propertyType === 'innerText') {
      element[propertyType] = newValue;
    }
  });
}
