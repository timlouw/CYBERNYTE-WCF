import { Component, registerComponent, __bindIf, __setupEventDelegation } from "../../../runtime/dom/index.js";
import { signal } from "../../../runtime/signal/signal.js";
const EventWhenTest = registerComponent(
  { selector: "eventwhentest-comp", type: "component" },
  class extends Component {
    static template = (() => {
      const t = document.createElement("template");
      t.innerHTML = `<button id="b0" data-evt-click="e0">Click</button>`;
      return t;
    })();
    initializeBindings = () => {
      const r = this.shadowRoot;
      __bindIf(r, this._visible, "b0", `<button id="b0" data-evt-click="e0">Click</button>`, () => []);
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
  EventWhenTest
};
