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

// ============================================================================
// GlobalStyleManager - Singleton for shared global CSS across all Shadow DOMs
// ============================================================================

/**
 * Singleton that manages the global CSSStyleSheet shared across all Shadow DOMs.
 *
 * ## Performance Benefits:
 * - Single CSSStyleSheet instance shared via adoptedStyleSheets (zero duplication)
 * - CSS pre-bundled at compile time (no runtime fetch/parse)
 * - Constructable Stylesheets are highly optimized by browsers
 * - Memory efficient: one sheet adopted by many shadow roots
 *
 * ## Usage (in main.ts or entry file):
 * ```typescript
 * import globalStyles from 'styles:./assets/global.css';
 * import themeStyles from 'styles:./assets/theme.css';
 * import { registerGlobalStyles } from 'wcf/runtime/dom';
 *
 * // Register before mounting components - styles are combined in order
 * registerGlobalStyles(globalStyles, themeStyles);
 * ```
 */
class GlobalStyleManager {
  private static instance: GlobalStyleManager | null = null;
  private globalSheet: CSSStyleSheet | null = null;
  private registeredStyles: string[] = [];

  private constructor() {}

  /**
   * Get singleton instance (lazy initialization)
   */
  static getInstance(): GlobalStyleManager {
    if (!GlobalStyleManager.instance) {
      GlobalStyleManager.instance = new GlobalStyleManager();
    }
    return GlobalStyleManager.instance;
  }

  /**
   * Register global CSS strings to be shared across all shadow roots.
   * Call this before mounting components. Styles are concatenated in order.
   * @param styles - CSS strings to register (typically imported via styles: prefix)
   */
  register(...styles: string[]): void {
    this.registeredStyles.push(...styles);
    // Invalidate cached sheet so it rebuilds with new styles
    this.globalSheet = null;
  }

  /**
   * Get or create the global CSSStyleSheet
   * Uses lazy initialization - sheet is only created when first component registers
   */
  getGlobalSheet(): CSSStyleSheet {
    if (!this.globalSheet) {
      this.globalSheet = new CSSStyleSheet();
      // Combine all registered styles
      const combinedCSS = this.registeredStyles.join('\n');
      this.globalSheet.replaceSync(combinedCSS);
    }
    return this.globalSheet;
  }

  /**
   * Check if any global styles have been registered
   */
  hasStyles(): boolean {
    return this.registeredStyles.length > 0;
  }

  /**
   * Adopt global + component sheets into a shadow root
   * @param shadowRoot - The shadow root to adopt styles into
   * @param componentSheet - The component-specific CSSStyleSheet
   */
  adoptStyles(shadowRoot: ShadowRoot, componentSheet: CSSStyleSheet): void {
    if (this.hasStyles()) {
      // Global styles first (lower specificity), then component styles (higher specificity)
      shadowRoot.adoptedStyleSheets = [this.getGlobalSheet(), componentSheet];
    } else {
      // No global styles registered, just use component styles
      shadowRoot.adoptedStyleSheets = [componentSheet];
    }
  }
}

// Export singleton accessor
export const globalStyleManager = GlobalStyleManager.getInstance();

/**
 * Register global CSS to be shared across all Shadow DOM components.
 * Call this in your entry file before mounting any components.
 *
 * @example
 * ```typescript
 * // main.ts
 * import globalStyles from 'styles:./assets/global.css';
 * import themeStyles from 'styles:./assets/theme.css';
 * import resetStyles from 'styles:./assets/reset.css';
 *
 * // Register styles in order (reset → global → theme)
 * registerGlobalStyles(resetStyles, globalStyles, themeStyles);
 *
 * // Then mount your app
 * mount(AppComponent, document.body);
 * ```
 *
 * @param styles - CSS strings to register, combined in order
 */
export function registerGlobalStyles(...styles: string[]): void {
  globalStyleManager.register(...styles);
}

// OVERLOAD For 'component' type, return a callable function that accepts props
export function registerComponent<T extends ComponentProps>(config: CreateComponentConfig & { type: 'component' }, component: InputComponent): ComponentHTMLSelector<T>;

// OVERLOAD For 'page' type, return a simple HTML template string
export function registerComponent(config: CreateComponentConfig & { type: 'page' }, component: InputComponent): PageHTMLSelector;

// Single function implementation to handle both cases
export function registerComponent<T extends ComponentProps>(config: CreateComponentConfig, component: InputComponent): ComponentHTMLSelector<T> | PageHTMLSelector {
  // Create component-specific stylesheet (one per component type, shared across instances)
  const componentSheet = new CSSStyleSheet();
  componentSheet.replaceSync(containmentCSS + component.styles);

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
          // Adopt both global and component stylesheets
          globalStyleManager.adoptStyles(this.shadowRoot, componentSheet);

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
