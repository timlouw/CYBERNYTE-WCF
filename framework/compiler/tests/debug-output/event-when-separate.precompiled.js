import { Component, registerComponent } from "../../../runtime/dom/shadow-dom.js";
import { signal } from "../../../runtime/signal/signal.js";
const SeparateTest = registerComponent(
  { selector: "separatetest-comp", type: "component" },
  class extends Component {
    _visible = signal(true);
    render = () => {
      return html`<div "${when(this._visible())}"><button @click=${this._handleClick}>Click</button></div>`;
    };
    _handleClick() {
      console.log("clicked");
    }
    static styles = css``;
  }
);
export {
  SeparateTest
};
