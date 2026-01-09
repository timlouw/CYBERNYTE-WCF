var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// framework/compiler/bootstrap.ts
function mount(component, target = document.body) {
  const match = component.match(/^<([a-z][a-z0-9-]*)>/i);
  if (!match || !target) return;
  const element = document.createElement(match[1]);
  target.appendChild(element);
}

// framework/runtime/dom/shadow-dom.ts
var Component = class extends HTMLElement {
};
__publicField(Component, "styles");
__publicField(Component, "template");
var containmentCSS = ":host{contain:layout style;display:block}";
function registerComponent(config, component) {
  const styleSheet = new CSSStyleSheet();
  styleSheet.replaceSync(containmentCSS + component.styles);
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
          this.shadowRoot.adoptedStyleSheets = [styleSheet];
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
  }
}

// framework/runtime/dom/dom-binding.ts
var tempEl = document.createElement("template");
var __bindIf = (root, signal2, id, template, initNested) => {
  let cleanups = [];
  let el = root.getElementById(id);
  const isTemplate = (el == null ? void 0 : el.tagName) === "TEMPLATE";
  if (isTemplate && el) {
    tempEl.innerHTML = template;
    const content = tempEl.content.firstElementChild;
    if (content) {
      content.style.display = "none";
      el.replaceWith(content);
      el = root.getElementById(id);
    }
  }
  if (el) {
    cleanups = initNested();
  }
  const unsubscribe = signal2.subscribe((value) => {
    const shouldShow = Boolean(value);
    const currentEl = root.getElementById(id);
    if (currentEl) {
      currentEl.style.display = shouldShow ? "" : "none";
    }
  }, false);
  return () => {
    unsubscribe();
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
    cleanups = [];
  };
};
var __bindIfExpr = (root, signals, evalExpr, id, template, initNested) => {
  let cleanups = [];
  let el = root.getElementById(id);
  const isTemplate = (el == null ? void 0 : el.tagName) === "TEMPLATE";
  if (isTemplate && el) {
    tempEl.innerHTML = template;
    const content = tempEl.content.firstElementChild;
    if (content) {
      content.style.display = "none";
      el.replaceWith(content);
      el = root.getElementById(id);
    }
  }
  if (el) {
    cleanups = initNested();
  }
  const update = () => {
    const shouldShow = Boolean(evalExpr());
    const currentEl = root.getElementById(id);
    if (currentEl) {
      currentEl.style.display = shouldShow ? "" : "none";
    }
  };
  const unsubscribes = new Array(signals.length);
  for (let i = 0; i < signals.length; i++) {
    unsubscribes[i] = signals[i].subscribe(update, false);
  }
  update();
  return () => {
    for (let i = 0; i < unsubscribes.length; i++) unsubscribes[i]();
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
    cleanups = [];
  };
};

// framework/runtime/signal/signal.ts
var pendingUpdates = null;
var rafScheduled = false;
var flushUpdates = () => {
  if (pendingUpdates) {
    const updates = pendingUpdates;
    pendingUpdates = null;
    rafScheduled = false;
    for (const update of updates) {
      update();
    }
  }
};
var scheduleUpdate = (callback) => {
  if (!pendingUpdates) {
    pendingUpdates = /* @__PURE__ */ new Set();
  }
  pendingUpdates.add(callback);
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
        for (const callback of subscribers) {
          scheduleUpdate(() => callback(value));
        }
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

// apps/client/components/test.ts
var _a;
var MyElementComponent = registerComponent(
  { selector: "my-element", type: "component" },
  (_a = class extends Component {
    constructor() {
      super(...arguments);
      __publicField(this, "initializeBindings", () => {
        const r = this.shadowRoot;
        const b4 = r.getElementById("b4");
        const b5 = r.getElementById("b5");
        const b6 = r.getElementById("b6");
        const b7 = r.getElementById("b7");
        b4.style.backgroundColor = this._color();
        b5.style.backgroundColor = this._color();
        b6.firstChild.data = this._text();
        b7.firstChild.data = this._text();
        this._color.subscribe((v) => {
          b4.style.backgroundColor = v;
          b5.style.backgroundColor = v;
        }, true);
        this._text.subscribe((v) => {
          b6.firstChild.data = v;
          b7.firstChild.data = v;
        }, true);
        __bindIf(r, this._loading, "b0", `<div id="b0" class="box" style="background-color: "></div>`, () => {
          const b0 = r.getElementById("b0");
          b0.style.backgroundColor = this._color();
          return [
            this._color.subscribe((v) => {
              b0.style.backgroundColor = v;
            }, true)
          ];
        });
        __bindIf(r, this._loading, "b1", `<div id="b1" class="box" style="background-color: "></div>`, () => {
          const b1 = r.getElementById("b1");
          b1.style.backgroundColor = this._color();
          return [
            this._color.subscribe((v) => {
              b1.style.backgroundColor = v;
            }, true)
          ];
        });
        __bindIfExpr(r, [this._loading], () => !this._loading() && this.test, "b2", `<div id="b2" class="box2">asdfs</div>`, () => {
          const b2 = r.getElementById("b2");
          b2.firstChild.data = this._text();
          return [
            this._text.subscribe((v) => {
              b2.firstChild.data = v;
            }, true)
          ];
        });
        __bindIfExpr(r, [this._loading], () => !this._loading() && this.test, "b3", `<div id="b3" class="box2">asdfs</div>`, () => {
          const b3 = r.getElementById("b3");
          b3.firstChild.data = this._text();
          return [
            this._text.subscribe((v) => {
              b3.firstChild.data = v;
            }, true)
          ];
        });
      });
      __publicField(this, "_color", signal(this.getAttribute("color")));
      __publicField(this, "_text", signal("asdfs"));
      __publicField(this, "_loading", signal(false));
      __publicField(this, "test", true);
      __publicField(this, "render", () => {
        this._update();
        setTimeout(() => {
          this._update();
        }, 1500);
        return ``;
      });
      __publicField(this, "_update", () => {
        this._color(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
        this._text(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
        this._loading(!this._loading());
      });
    }
  }, __publicField(_a, "template", (() => {
    const t = document.createElement("template");
    t.innerHTML = `<div id="b4" class="box" style="background-color: "></div> <div id="b5" class="box" style="background-color: "></div> <template id="b0"></template> <template id="b1"></template> <div id="b6" class="box2">asdfs</div> <div id="b7" class="box2">asdfs</div> <template id="b2"></template> <template id="b3"></template>`;
    return t;
  })()), __publicField(_a, "styles", `
      .box {
        width: 100%;
        height: 20px;
        border-radius: 5px;
        border: 1px solid black;
      }

      .box2 {
        width: 100%;
        height: 20px;
        background-color: black;
        border-radius: 5px;
        border: 2px solid green;
      }
    `), _a)
);

// apps/client/pages/landing.ts
var _a2;
var AppComponent = registerComponent(
  { selector: "ui-landing-page", type: "page" },
  (_a2 = class extends Component {
    constructor() {
      super(...arguments);
      __publicField(this, "render", () => {
        console.log("rendering landing page");
        return `
        HELLO 
      <my-element
        color="red">
      </my-element> 
      <my-element
        color="red">
      </my-element> 
      <my-element
        color="red">
      </my-element> 
      <my-element
        color="red">
      </my-element>
      `;
      });
    }
  }, __publicField(_a2, "styles", ``), _a2)
);

// apps/client/main.ts
mount(AppComponent, document.body);
