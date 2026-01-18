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
var KEY_CODES = {
  enter: ["Enter"],
  tab: ["Tab"],
  delete: ["Backspace", "Delete"],
  esc: ["Escape"],
  escape: ["Escape"],
  space: [" "],
  up: ["ArrowUp"],
  down: ["ArrowDown"],
  left: ["ArrowLeft"],
  right: ["ArrowRight"]
};
var __setupEventDelegation = (root, eventMap) => {
  const cleanups = [];
  for (const [eventType, handlers] of Object.entries(eventMap)) {
    const handlerMap = new Map(Object.entries(handlers));
    const attrName = `data-evt-${eventType}`;
    const delegatedHandler = (event) => {
      let target = event.target;
      while (target && target !== root) {
        if (target instanceof HTMLElement) {
          const handlerIdWithModifiers = target.getAttribute(attrName);
          if (handlerIdWithModifiers) {
            const parts = handlerIdWithModifiers.split(":");
            const handlerId = parts[0];
            const modifiers = new Set(parts.slice(1));
            const handler = handlerMap.get(handlerId);
            if (handler) {
              if (modifiers.has("self") && event.target !== target) {
                target = target.parentElement;
                continue;
              }
              if (event instanceof KeyboardEvent) {
                let keyMatched = true;
                for (const mod of modifiers) {
                  if (KEY_CODES[mod]) {
                    keyMatched = KEY_CODES[mod].includes(event.key);
                    if (!keyMatched) break;
                  }
                }
                if (!keyMatched) {
                  target = target.parentElement;
                  continue;
                }
              }
              if (modifiers.has("prevent")) event.preventDefault();
              if (modifiers.has("stop")) event.stopPropagation();
              handler.call(null, event);
              return;
            }
          }
        }
        target = target.parentElement;
      }
    };
    root.addEventListener(eventType, delegatedHandler, true);
    cleanups.push(() => {
      root.removeEventListener(eventType, delegatedHandler, true);
    });
  }
  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
};
var tempEl = document.createElement("template");
var bindConditional = (root, id, template, initNested, subscribe, evalCondition) => {
  let cleanups = [];
  let bindingsInitialized = false;
  const initialElement = root.getElementById(id);
  const initiallyShowing = initialElement?.tagName !== "TEMPLATE";
  let contentEl;
  if (initiallyShowing) {
    contentEl = initialElement;
  } else {
    tempEl.innerHTML = template;
    contentEl = tempEl.content.cloneNode(true).firstElementChild;
  }
  let currentlyShowing = initiallyShowing;
  if (initiallyShowing) {
    bindingsInitialized = true;
    cleanups = initNested();
  }
  const show = () => {
    if (currentlyShowing) return;
    currentlyShowing = true;
    const current = root.getElementById(id);
    if (current && contentEl) {
      current.replaceWith(contentEl);
      if (!bindingsInitialized) {
        bindingsInitialized = true;
        cleanups = initNested();
      }
    }
  };
  const hide = () => {
    if (!currentlyShowing) return;
    currentlyShowing = false;
    const current = root.getElementById(id);
    if (current) {
      const p = document.createElement("template");
      p.id = id;
      current.replaceWith(p);
    }
  };
  const update = () => {
    if (evalCondition()) {
      show();
    } else {
      hide();
    }
  };
  const unsubscribes = subscribe(update);
  update();
  return () => {
    for (let i = 0; i < unsubscribes.length; i++) unsubscribes[i]();
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
    cleanups = [];
  };
};
var __bindIf = (root, signal2, id, template, initNested) => bindConditional(
  root,
  id,
  template,
  initNested,
  (update) => [signal2.subscribe(update, true)],
  () => Boolean(signal2())
);

// framework/compiler/tests/debug-output/event-when-separate.ts
var SeparateTest = registerComponent(
  { selector: "separatetest-comp", type: "component" },
  class extends Component {
    static template = (() => {
      const t = document.createElement("template");
      t.innerHTML = `<div id="b0"><button data-evt-click="e0">Click</button></div>`;
      return t;
    })();
    initializeBindings = () => {
      const r = this.shadowRoot;
      __bindIf(r, this._visible, "b0", `<div id="b0"><button data-evt-click="e0">Click</button></div>`, () => []);
      __setupEventDelegation(r, {
        click: { "e0": (e) => this._handleClick.call(this, e), "e1": (e) => this._handleClick.call(this, e) }
      });
    };
    _visible = signal(true);
    render = () => {
      return ``;
    };
    _handleClick() {
      console.log("clicked");
    }
    static styles = ``;
  }
);
export {
  SeparateTest
};
