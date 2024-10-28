type LowercaseString = `${Lowercase<string>}`;
type ValidComponentName = `${LowercaseString}-${LowercaseString}`;

interface CreateComponentConfig {
  name: ValidComponentName;
}

interface InputComponent {
  new (...params: any[]): HTMLElement;
  styles: string;
}

export abstract class Component extends HTMLElement {
  static styles: string;
  abstract render: () => string;
  abstract initializeBindings: () => void;
}

export const registerComponent = (config: CreateComponentConfig, component: InputComponent): string => {
  const styleSheet = new CSSStyleSheet();
  styleSheet.replaceSync(component.styles);

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
          this.shadowRoot.adoptedStyleSheets = [styleSheet];
          this.shadowRoot.innerHTML = this.render();
          this.initializeBindings();
        }
      }

      render() {
        return html``;
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
};
