import { startShadowDomClickListeners } from './data-bindings/data-click-binding';
import { startShadowDomIfElementListeners } from './data-bindings/data-if-binding';

interface CreateComponentConfig {
  name: string;
  html?: () => Promise<any>;
  css?: () => Promise<any>;
  changeDetection?: boolean;
  clickDetection?: boolean;
  fullHeight?: boolean;
}

interface BaseComponent {
  new (...params: any[]): Component;
}

export abstract class Component extends HTMLElement {
  abstract render(): void;
}

export const registerComponent = (config: CreateComponentConfig, component: BaseComponent): string => {
  window.customElements.define(
    config.name,
    class extends component {
      constructor() {
        super();
        this.createComponent();
      }

      async createComponent() {
        this.setComponentClass();

        await this.setComponentHTML();

        this.render();

        await this.setComponentStyles();

        if (config.clickDetection) {
          startShadowDomClickListeners(this);
        }

        if (config.changeDetection) {
          startShadowDomIfElementListeners(this);
        }
      }

      async setComponentHTML() {
        const html = config.html ? await config.html() : '';
        if (html.default) this.innerHTML = html.default;
      }

      async setComponentStyles() {
        const css = config.css ? await config.css() : '';
        if (css.default) this.insertAdjacentHTML('beforeend', `<style>${css.default}<style>`);
      }

      setComponentClass() {
        const compClass = this.className + (config.fullHeight ? ' full-height-page-or-component' : '');
        if (compClass) this.className = compClass;
      }

      render() {}
    },
  );
  return config.name;
};

export class ShadowDOM {
  #componentThis;
  #clickDetection;
  #changeDetection;

  constructor(compThis: any, clickDetection: boolean, changeDetection: boolean, fullHeight = false) {
    this.#componentThis = compThis;
    this.#clickDetection = clickDetection;
    this.#changeDetection = changeDetection;
    this.refreshInnerDom(fullHeight);
  }

  refreshInnerDom = (fullHeight: boolean) => {
    const compClass = this.#componentThis.className + (fullHeight ? ' full-height-page-or-component' : '');
    if (compClass) this.#componentThis.className = compClass;

    this.#componentThis.setElementInnerHTML(this.#componentThis);

    this.refreshShadowDomListeners();
  };

  refreshShadowDomListeners = () => {
    if (this.#clickDetection) {
      startShadowDomClickListeners(this.#componentThis);
    }

    if (this.#changeDetection) {
      startShadowDomIfElementListeners(this.#componentThis);
    }
  };
}
