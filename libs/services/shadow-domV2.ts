import type { Signal } from '@models';

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

      render(): string {
        return html``;
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
    return ((props: T) => `
      <${config.selector}
        ${Object.entries(props)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ')}>
      </${config.selector}>`) as ComponentHTMLSelector<T>;
  }
}

/** Core binding function - finds element by ID and subscribes to signal */
const __bind = (root: ShadowRoot, signal: Signal<any>, id: string, update: (el: HTMLElement, v: any) => void): void => {
  const el = root.getElementById(id);
  if (el) signal.subscribe((v) => update(el, v));
};

/** Bind signal to element style property */
export const __bindStyle = (root: ShadowRoot, signal: Signal<any>, id: string, prop: string): void => {
  __bind(root, signal, id, (el, v) => {
    (el.style as any)[prop] = v;
  });
};

/** Bind signal to element attribute */
export const __bindAttr = (root: ShadowRoot, signal: Signal<any>, id: string, attr: string): void => {
  __bind(root, signal, id, (el, v) => {
    el.setAttribute(attr, v);
  });
};

/** Bind signal to element textContent */
export const __bindText = (root: ShadowRoot, signal: Signal<any>, id: string): void => {
  __bind(root, signal, id, (el, v) => {
    el.textContent = v;
  });
};
