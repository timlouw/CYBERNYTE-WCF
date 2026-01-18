import { Component, registerComponent, __bindRepeat, __bindNestedRepeat, __findEl } from "../../../runtime/dom/index.js";
import { signal } from "../../../runtime/signal/signal.js";
const NestedRepeatTest = registerComponent(
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
