import { createComponentHTMLSelector } from './component-html.js';

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
  static template?: HTMLTemplateElement;
  abstract render: () => string;
}

// CSS containment prefix for all components
const containmentCSS = ':host{contain:layout style;display:block}';

// OVERLOAD For 'component' type, return a callable function that accepts props
export function registerComponent<T extends ComponentProps>(config: CreateComponentConfig & { type: 'component' }, component: InputComponent): ComponentHTMLSelector<T>;

// OVERLOAD For 'page' type, return a simple HTML template string
export function registerComponent(config: CreateComponentConfig & { type: 'page' }, component: InputComponent): PageHTMLSelector;

// Single function implementation to handle both cases
export function registerComponent<T extends ComponentProps>(config: CreateComponentConfig, component: InputComponent): ComponentHTMLSelector<T> | PageHTMLSelector {
  const styleSheet = new CSSStyleSheet();
  styleSheet.replaceSync(containmentCSS + component.styles);

  window.customElements.define(
    config.selector,
    class extends component {
      constructor() {
        super();
        this.createComponent();
      }

      private render(): string {
        return '';
      }

      private createComponent() {
        this.attachShadow({ mode: 'open' });
        if (this.shadowRoot) {
          this.shadowRoot.adoptedStyleSheets = [styleSheet];

          const ctor = this.constructor as typeof Component;
          if (ctor.template) {
            this.shadowRoot.appendChild(ctor.template.content.cloneNode(true));
            this.render();
          } else {
            this.shadowRoot.innerHTML = this.render();
          }

          if (this.initializeBindings) {
            this.initializeBindings();
          }
        }
      }

      private initializeBindings() {}
    },
  );

  // Conditional return type based on `config.type`
  if (config.type === 'page') {
    return `<${config.selector}></${config.selector}>` as PageHTMLSelector;
  } else {
    // Use the shared HTML generator - same function used at compile-time (CTFE)
    return createComponentHTMLSelector<T>(config.selector);
  }
}
