interface CreateComponentConfig {
  name: string;
  clickDetection?: boolean;
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
const observerMap = new Map<string, IntersectionObserver>();

const handleVisibility = (config: CreateComponentConfig) => {
  const entriesCallback = (entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        console.log('Element is visible:', entry.target);
        const targetComponent = entry.target as Component;

        if (targetComponent.shadowRoot) {
          if (targetComponent.bindClickListeners) {
            targetComponent.bindClickListeners();
          }
        }

        const observer = observerMap.get(config.name);
        if (observer) observer.unobserve(targetComponent);
      }
    });
  };

  return new IntersectionObserver(entriesCallback, {
    root: null,
    threshold: 0.1, // Visibility threshold
  });
};

export const registerComponent = (config: CreateComponentConfig, component: InputComponent): string => {
  let observer: any = null;

  if (config.clickDetection) {
    observer = observerMap.get(config.name);
    if (!observer) {
      observer = handleVisibility(config);
      observerMap.set(config.name, observer);
    }
  }

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

          if (config.clickDetection) {
            observer.observe(this);
          }
        }
      }

      render() {
        return ``;
      }
      styles() {
        return '';
      }
      bindClickListeners() {}
    },
  );
  return config.name;
};
