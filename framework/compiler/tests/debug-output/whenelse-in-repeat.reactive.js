import { Component, registerComponent, __bindIfExpr, __bindRepeat } from "../../../runtime/dom/index.js";
import { signal } from "../../../runtime/signal/signal.js";
const WhenElseInRepeatTest = registerComponent(
  { selector: "whenelseinrepeattest-comp", type: "component" },
  class extends Component {
    static template = (() => {
      const t = document.createElement("template");
      t.innerHTML = `<ul> <template id="b2"></template>`;
      return t;
    })();
    initializeBindings = () => {
      const r = this.shadowRoot;
      __bindIfExpr(r, [], () => item.active, "b0", `<span id="b0" class="active">Active: \${item.name}</span>`, () => []);
      __bindIfExpr(r, [], () => !item.active, "b1", `<span id="b1" class="inactive">Inactive: \${item.name}</span>`, () => []);
      __bindRepeat(r, this._items, "b2", (item$, _idx) => `<li> <template id="b3"></template><span id="b4" class="inactive">Inactive: ${item.name}</span> </li>`, (els, item$, _idx) => []);
    };
    _items = signal([
      { name: "Item 1", active: true },
      { name: "Item 2", active: false }
    ]);
    render = () => {
      return ``;
    };
    static styles = ``;
  }
);
export {
  WhenElseInRepeatTest
};
