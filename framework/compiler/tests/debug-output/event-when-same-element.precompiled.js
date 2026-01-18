import { Component, registerComponent } from "../../../runtime/dom/shadow-dom.js";
import { signal } from "../../../runtime/signal/signal.js";
const EventWhenTest = registerComponent(
  { selector: "eventwhentest-comp", type: "component" },
  class extends Component {
    _visible = signal(true);
    render = () => {
      return html`<button "${when(this._visible())}" @click=${this._handleClick}>Click</button>`;
    };
    _handleClick() {
      console.log("clicked");
    }
    static styles = css``;
  }
);
export {
  EventWhenTest
};
