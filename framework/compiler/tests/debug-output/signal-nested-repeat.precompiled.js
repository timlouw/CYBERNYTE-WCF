import { Component, registerComponent } from "../../../runtime/dom/shadow-dom.js";
import { signal } from "../../../runtime/signal/signal.js";
const SignalNestedRepeatTest = registerComponent(
  { selector: "signalnestedrepeattest-comp", type: "component" },
  class extends Component {
    _groups = signal([{ id: 1, name: "Group 1" }, { id: 2, name: "Group 2" }]);
    _itemsForGroup = (id) => signal(["item-" + id]);
    render = () => {
      return html`<ul>
        ${repeat(this._groups(), (group) => html`
          <li>
            ${group.name}
            <ul>
              ${repeat(this._itemsForGroup(group.id), (item) => html`<li>${item}</li>`)}
            </ul>
          </li>
        `)}
      </ul>`;
    };
    static styles = css``;
  }
);
export {
  SignalNestedRepeatTest
};
