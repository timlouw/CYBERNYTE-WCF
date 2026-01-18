// framework/runtime/dom/component-html.ts
var generateComponentHTML = (config) => {
  const { selector, props } = config;
  const propsString = Object.entries(props).map(([key, value]) => {
    const val = typeof value === "string" ? value : JSON.stringify(value) || "";
    return `${key}="${val.replace(/"/g, "&quot;")}"`;
  }).join(" ");
  return `
      <${selector}
        ${propsString}>
      </${selector}>`;
};
var createComponentHTMLSelector = (selector) => {
  return (props) => generateComponentHTML({ selector, props });
};

// framework/runtime/dom/shadow-dom.ts
var Component = class extends HTMLElement {
  static styles;
  static template;
};
var containmentCSS = ":host{contain:layout style;display:block}";
var GlobalStyleManager = class _GlobalStyleManager {
  static instance = null;
  globalSheet = null;
  registeredStyles = [];
  constructor() {
  }
  /**
   * Get singleton instance (lazy initialization)
   */
  static getInstance() {
    if (!_GlobalStyleManager.instance) {
      _GlobalStyleManager.instance = new _GlobalStyleManager();
    }
    return _GlobalStyleManager.instance;
  }
  /**
   * Register global CSS strings to be shared across all shadow roots.
   * Call this before mounting components. Styles are concatenated in order.
   * @param styles - CSS strings to register (typically imported via styles: prefix)
   */
  register(...styles) {
    this.registeredStyles.push(...styles);
    this.globalSheet = null;
  }
  /**
   * Get or create the global CSSStyleSheet
   * Uses lazy initialization - sheet is only created when first component registers
   */
  getGlobalSheet() {
    if (!this.globalSheet) {
      this.globalSheet = new CSSStyleSheet();
      const combinedCSS = this.registeredStyles.join("\n");
      this.globalSheet.replaceSync(combinedCSS);
    }
    return this.globalSheet;
  }
  /**
   * Adopt global + component sheets into a shadow root
   * @param shadowRoot - The shadow root to adopt styles into
   * @param componentSheet - The component-specific CSSStyleSheet
   */
  adoptStyles(shadowRoot, componentSheet) {
    if (this.registeredStyles.length > 0) {
      shadowRoot.adoptedStyleSheets = [this.getGlobalSheet(), componentSheet];
    } else {
      shadowRoot.adoptedStyleSheets = [componentSheet];
    }
  }
};
var globalStyleManager = GlobalStyleManager.getInstance();
function registerComponent(config, component) {
  const componentSheet = new CSSStyleSheet();
  componentSheet.replaceSync(containmentCSS + component.styles);
  window.customElements.define(
    config.selector,
    class extends component {
      constructor() {
        super();
        this.createComponent();
      }
      render() {
        return "";
      }
      createComponent() {
        this.attachShadow({ mode: "open" });
        if (this.shadowRoot) {
          globalStyleManager.adoptStyles(this.shadowRoot, componentSheet);
          const ctor = this.constructor;
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
      initializeBindings() {
      }
    }
  );
  if (config.type === "page") {
    return `<${config.selector}></${config.selector}>`;
  } else {
    return createComponentHTMLSelector(config.selector);
  }
}

// framework/runtime/signal/signal.ts
var pendingUpdates = null;
var rafScheduled = false;
var flushUpdates = () => {
  if (pendingUpdates) {
    const updates = pendingUpdates;
    pendingUpdates = null;
    rafScheduled = false;
    for (let i = 0; i < updates.length; i++) {
      updates[i][0](updates[i][1]);
    }
  }
};
var scheduleUpdate = (callback, value) => {
  if (!pendingUpdates) {
    pendingUpdates = [];
  }
  pendingUpdates.push([callback, value]);
  if (!rafScheduled) {
    rafScheduled = true;
    queueMicrotask(flushUpdates);
  }
};
var signal = (initialValue) => {
  let value = initialValue;
  let subscribers = null;
  function reactiveFunction(newValue) {
    if (arguments.length === 0) {
      return value;
    }
    if (value !== newValue) {
      value = newValue;
      if (subscribers) {
        subscribers.forEach((callback) => {
          scheduleUpdate(callback, value);
        });
      }
    }
    return value;
  }
  reactiveFunction.subscribe = (callback, skipInitial) => {
    if (!subscribers) subscribers = /* @__PURE__ */ new Set();
    subscribers.add(callback);
    if (!skipInitial) {
      callback(value);
    }
    return () => {
      subscribers.delete(callback);
    };
  };
  return reactiveFunction;
};

// framework/runtime/dom/dom-binding.ts
var tempEl = document.createElement("template");
var __findEl = (elements, id) => {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.id === id || el.getAttribute?.("data-bind-id") === id) return el;
    const found = el.querySelector?.(`#${id}, [data-bind-id="${id}"]`);
    if (found) return found;
  }
  return null;
};
var __bindRepeat = (root, arraySignal, anchorId, templateFn, initItemBindings, emptyTemplate, itemEventHandlers) => {
  const managedItems = [];
  let nextId = 0;
  const anchor = root.getElementById(anchorId);
  if (!anchor) return () => {
  };
  const container = anchor.parentNode;
  if (!container) return () => {
  };
  let emptyElement = null;
  let emptyShowing = false;
  const showEmpty = () => {
    if (emptyShowing || !emptyTemplate) return;
    emptyShowing = true;
    tempEl.innerHTML = emptyTemplate;
    emptyElement = tempEl.content.cloneNode(true).firstElementChild;
    if (emptyElement) container.insertBefore(emptyElement, anchor);
  };
  const hideEmpty = () => {
    if (!emptyShowing || !emptyElement) return;
    emptyShowing = false;
    emptyElement.remove();
    emptyElement = null;
  };
  const createItem = (item, index, refNode) => {
    const id = nextId++;
    const itemSignal = signal(item);
    const html = templateFn(itemSignal, index);
    tempEl.innerHTML = html;
    const fragment = tempEl.content.cloneNode(true);
    const nodes = Array.from(fragment.childNodes);
    for (const node of nodes) {
      container.insertBefore(node, refNode);
    }
    const elements = nodes.filter((n) => n.nodeType === Node.ELEMENT_NODE);
    const cleanups = initItemBindings(elements, itemSignal, index);
    if (itemEventHandlers) {
      for (const eventType in itemEventHandlers) {
        const handlers = itemEventHandlers[eventType];
        for (const el of elements) {
          const nested = el.querySelectorAll(`[data-evt-${eventType}]`);
          const targets = [];
          if (el.hasAttribute(`data-evt-${eventType}`)) targets.push(el);
          for (let i = 0; i < nested.length; i++) targets.push(nested[i]);
          for (const target of targets) {
            const handlerId = target.getAttribute(`data-evt-${eventType}`)?.split(":")[0];
            if (handlerId && handlers[handlerId]) {
              const handler = handlers[handlerId];
              const listener = (e) => handler(itemSignal, index, e);
              target.addEventListener(eventType, listener);
              cleanups.push(() => target.removeEventListener(eventType, listener));
            }
          }
        }
      }
    }
    return { id, itemSignal, nodes, cleanups };
  };
  const removeItem = (managed) => {
    for (const cleanup of managed.cleanups) cleanup();
    for (const node of managed.nodes) node.remove();
  };
  const reconcile = (newItems) => {
    const newLength = newItems?.length ?? 0;
    const oldLength = managedItems.length;
    if (newLength === 0) {
      for (const managed of managedItems) removeItem(managed);
      managedItems.length = 0;
      showEmpty();
      return;
    }
    hideEmpty();
    const minLength = Math.min(oldLength, newLength);
    for (let i = 0; i < minLength; i++) {
      const managed = managedItems[i];
      if (managed.itemSignal() !== newItems[i]) {
        managed.itemSignal(newItems[i]);
      }
    }
    if (newLength < oldLength) {
      for (let i = newLength; i < oldLength; i++) {
        removeItem(managedItems[i]);
      }
      managedItems.length = newLength;
    }
    if (newLength > oldLength) {
      for (let i = oldLength; i < newLength; i++) {
        const managed = createItem(newItems[i], i, anchor);
        managedItems.push(managed);
      }
    }
  };
  reconcile(arraySignal());
  const unsubscribe = arraySignal.subscribe((items) => {
    reconcile(items);
  }, true);
  return () => {
    unsubscribe();
    hideEmpty();
    for (const managed of managedItems) removeItem(managed);
    managedItems.length = 0;
  };
};
var __bindNestedRepeat = (elements, parentSignal, getArray, anchorId, templateFn, initItemBindings, emptyTemplate) => {
  const anchor = __findEl(elements, anchorId);
  if (!anchor) return () => {
  };
  const container = anchor.parentNode;
  if (!container) return () => {
  };
  const managedItems = [];
  let nextId = 0;
  let emptyElement = null;
  let emptyShowing = false;
  const showEmpty = () => {
    if (emptyShowing || !emptyTemplate) return;
    emptyShowing = true;
    tempEl.innerHTML = emptyTemplate;
    emptyElement = tempEl.content.cloneNode(true).firstElementChild;
    if (emptyElement) container.insertBefore(emptyElement, anchor);
  };
  const hideEmpty = () => {
    if (!emptyShowing || !emptyElement) return;
    emptyShowing = false;
    emptyElement.remove();
    emptyElement = null;
  };
  const createItem = (item, index, refNode) => {
    const id = nextId++;
    const itemSignal = signal(item);
    const html = templateFn(itemSignal, index);
    tempEl.innerHTML = html;
    const fragment = tempEl.content.cloneNode(true);
    const nodes = Array.from(fragment.childNodes);
    for (const node of nodes) {
      container.insertBefore(node, refNode);
    }
    const itemElements = nodes.filter((n) => n.nodeType === Node.ELEMENT_NODE);
    const cleanups = initItemBindings(itemElements, itemSignal, index);
    return { id, itemSignal, nodes, cleanups };
  };
  const removeItem = (managed) => {
    for (const cleanup of managed.cleanups) cleanup();
    for (const node of managed.nodes) node.remove();
  };
  const reconcile = (newItems) => {
    const newLength = newItems?.length ?? 0;
    const oldLength = managedItems.length;
    if (newLength === 0) {
      for (const managed of managedItems) removeItem(managed);
      managedItems.length = 0;
      showEmpty();
      return;
    }
    hideEmpty();
    const minLength = Math.min(oldLength, newLength);
    for (let i = 0; i < minLength; i++) {
      const managed = managedItems[i];
      if (managed.itemSignal() !== newItems[i]) {
        managed.itemSignal(newItems[i]);
      }
    }
    if (newLength < oldLength) {
      for (let i = newLength; i < oldLength; i++) {
        removeItem(managedItems[i]);
      }
      managedItems.length = newLength;
    }
    if (newLength > oldLength) {
      for (let i = oldLength; i < newLength; i++) {
        const managed = createItem(newItems[i], i, anchor);
        managedItems.push(managed);
      }
    }
  };
  reconcile(getArray());
  const unsubscribe = parentSignal.subscribe(() => {
    reconcile(getArray());
  }, true);
  return () => {
    unsubscribe();
    hideEmpty();
    for (const managed of managedItems) removeItem(managed);
    managedItems.length = 0;
  };
};

// framework/compiler/tests/debug-output/nested-repeat.ts
var NestedRepeatTest = registerComponent(
  { selector: "nestedrepeattest-comp", type: "component" },
  class extends Component {
    static template = (() => {
      const t = document.createElement("template");
      t.innerHTML = `<ul> <template id="b0"></template> </ul>`;
      return t;
    })();
    initializeBindings = () => {
      const r = this.shadowRoot;
      __bindRepeat(r, this._items, "b0", (item$, _idx) => `<li> <span id="i3">${item$().name}</span> <ul> <template id="b1"></template> </ul> </li>`, (els, item$, _idx) => {
        const $ = (id) => __findEl(els, id);
        return [
          item$.subscribe(() => {
            let e;
            const v = item$().name;
            e = $("i3");
            if (e) e.textContent = v;
          }, true),
          __bindNestedRepeat(els, item$, () => item$().children, "b1", (child$, _idx2) => `<li><span id="i2">${child$()}</span></li>`, (nel, child$, _idx2) => {
            const $n = (id) => __findEl(nel, id);
            return [child$.subscribe(() => {
              const el = $n("i2");
              if (el) el.textContent = child$();
            }, true)];
          })
        ];
      });
    };
    _items = signal([
      { name: "Item 1", children: ["a", "b"] },
      { name: "Item 2", children: ["c", "d"] }
    ]);
    render = () => {
      return ``;
    };
    static styles = ``;
  }
);
export {
  NestedRepeatTest
};
