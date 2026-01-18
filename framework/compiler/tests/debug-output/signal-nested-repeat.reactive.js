import { Component, registerComponent, __bindRepeat, __bindNestedRepeat, __findEl } from "../../../runtime/dom/index.js";
import { signal } from "../../../runtime/signal/signal.js";
const SignalNestedRepeatTest = registerComponent(
  { selector: "signalnestedrepeattest-comp", type: "component" },
  class extends Component {
    static template = (() => {
      const t = document.createElement("template");
      t.innerHTML = `<ul> <template id="b0"></template> </ul>`;
      return t;
    })();
    initializeBindings = () => {
      const r = this.shadowRoot;
      __bindRepeat(r, this._groups, "b0", (group$, _idx) => `<li> <span id="i3">${group$().name}</span> <ul> <template id="b1"></template> </ul> </li>`, (els, group$, _idx) => {
        const $ = (id) => __findEl(els, id);
        return [
          group$.subscribe(() => {
            let e;
            const v = group$().name;
            e = $("i3");
            if (e) e.textContent = v;
          }, true),
          __bindNestedRepeat(els, group$, () => this._itemsForGroup(group$().id), "b1", (item$, _idx2) => `<li><span id="i2">${item$()}</span></li>`, (nel, item$, _idx2) => {
            const $n = (id) => __findEl(nel, id);
            return [item$.subscribe(() => {
              const el = $n("i2");
              if (el) el.textContent = item$();
            }, true)];
          })
        ];
      });
    };
    _groups = signal([{ id: 1, name: "Group 1" }, { id: 2, name: "Group 2" }]);
    _itemsForGroup = (id) => signal(["item-" + id]);
    render = () => {
      return ``;
    };
    static styles = ``;
  }
);
export {
  SignalNestedRepeatTest
};
