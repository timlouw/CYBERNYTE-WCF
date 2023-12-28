import { startShadowDomClickListeners } from './data-bindings/data-click-binding';
import { startShadowDomIfElementListeners } from './data-bindings/data-if-binding';

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
  abstract render: () => void;
  abstract styles: () => string;
}

export const registerComponent = (config: CreateComponentConfig, component: InputComponent): string => {
  window.customElements.define(
    config.name,
    class extends component {
      constructor() {
        super();
        this.createComponent();
      }

      async createComponent() {
        this.setComponentClass();

        this.render();

        this.insertAdjacentHTML('beforeend', this.styles());

        if (config.clickDetection) {
          startShadowDomClickListeners(this);
        }

        if (config.changeDetection) {
          startShadowDomIfElementListeners(this);
        }
      }

      setComponentClass() {
        const compClass = this.className + (config.fullHeight ? ' full-height-page-or-component' : '');
        if (compClass) this.className = compClass;
      }

      render() {}
      styles() {
        return '';
      }
    },
  );
  return config.name;
};
