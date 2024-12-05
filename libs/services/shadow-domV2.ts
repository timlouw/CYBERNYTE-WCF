type LowercaseString = `${Lowercase<string>}`;
type ValidComponentSelector = `${LowercaseString}-${LowercaseString}`;

interface CreateComponentConfig {
  selector: ValidComponentSelector;
  type: 'page' | 'component';
}

interface InputComponent {
  new (...params: any[]): HTMLElement;
  styles: string;
}

type ComponentProps = Record<string, any>;
type ComponentHTMLSelector<T> = (props: T) => string;
type PageHTMLSelector = `<${ValidComponentSelector}></${ValidComponentSelector}>`;

export abstract class Component extends HTMLElement {
  static styles: string;
  abstract render: () => string;
  abstract initializeBindings: () => void;
}

// Overloaded function declarations for `registerComponent`

// For 'component' type, return a callable function that accepts props
export function registerComponent<T extends ComponentProps>(
  config: CreateComponentConfig & { type: 'component' },
  component: InputComponent
): ComponentHTMLSelector<T>;

// For 'page' type, return a simple HTML template string
export function registerComponent(
  config: CreateComponentConfig & { type: 'page' },
  component: InputComponent
): PageHTMLSelector;

// Single function implementation to handle both cases
export function registerComponent<T extends ComponentProps>(
  config: CreateComponentConfig,
  component: InputComponent
): ComponentHTMLSelector<T> | PageHTMLSelector {

  const styleSheet = new CSSStyleSheet();
  styleSheet.replaceSync(component.styles);

  window.customElements.define(
    config.selector,
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
    }
  );

  // Conditional return type based on `config.type`
  if (config.type === 'page') {
    return `<${config.selector}></${config.selector}>` as PageHTMLSelector;
  } else {
    return ((props: T) => `
      <${config.selector}
        ${Object.entries(props).map(([key, value]) => `${key}="${value}"`).join(' ')}>
      </${config.selector}>`) as ComponentHTMLSelector<T>;
  }
};


// Bind Reactive Properties
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
