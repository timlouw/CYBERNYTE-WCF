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
  initializeBindings?: () => void;
}

// Overloaded function declarations for `registerComponent`

// For 'component' type, return a callable function that accepts props
export function registerComponent<T extends ComponentProps>(config: CreateComponentConfig & { type: 'component' }, component: InputComponent): ComponentHTMLSelector<T>;

// For 'page' type, return a simple HTML template string
export function registerComponent(config: CreateComponentConfig & { type: 'page' }, component: InputComponent): PageHTMLSelector;

// Single function implementation to handle both cases
export function registerComponent<T extends ComponentProps>(config: CreateComponentConfig, component: InputComponent): ComponentHTMLSelector<T> | PageHTMLSelector {
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
          if (this.initializeBindings) {
            this.initializeBindings();
          }
        }
      }

      render() {
        return html``;
      }

      initializeBindings() {}
    },
  );

  // Conditional return type based on `config.type`
  if (config.type === 'page') {
    return `<${config.selector}></${config.selector}>` as PageHTMLSelector;
  } else {
    return ((props: T) => `
      <${config.selector}
        ${Object.entries(props)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ')}>
      </${config.selector}>`) as ComponentHTMLSelector<T>;
  }
}

/**
 * Compiler-generated activation function for reactive bindings.
 * This is called at runtime with pre-computed binding information from the compiler.
 *
 * @param shadowRoot - The shadow root of the component
 * @param reactiveVar - The reactive signal variable
 * @param selector - The CSS selector for the target element (uses data-reactive-id)
 * @param propertyType - The type of property to update ('style' | 'attribute' | 'innerText')
 * @param property - The specific property name (for style/attribute types)
 */
export const __activateBinding = (
  shadowRoot: ShadowRoot,
  reactiveVar: { subscribe: (callback: (value: any) => void) => () => void },
  selector: string,
  propertyType: 'style' | 'attribute' | 'innerText',
  property?: string,
): void => {
  const element = shadowRoot.querySelector(selector) as HTMLElement;

  if (!element) {
    console.warn(`[ReactiveBinding] Element not found for selector: ${selector}`);
    return;
  }

  // Pre-determine the update function based on property type
  const updateElement: (newValue: any) => void =
    propertyType === 'style' && property
      ? (newValue) => {
          element.style[property as any] = newValue;
        }
      : propertyType === 'attribute' && property
      ? (newValue) => {
          element.setAttribute(property, newValue);
        }
      : propertyType === 'innerText'
      ? (newValue) => {
          element.innerText = newValue;
        }
      : () => {};

  // Subscribe to the reactive variable
  reactiveVar.subscribe(updateElement);
};
