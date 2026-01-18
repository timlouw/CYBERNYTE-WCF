import { Component, registerComponent } from "../../../runtime/dom/shadow-dom.js";
import { signal } from "../../../runtime/signal/signal.js";
const NestedRepeatTest = registerComponent(
  { selector: "nestedrepeattest-comp", type: "component" },
  class extends Component {
    _items = signal([
      { name: "Item 1", children: ["a", "b"] },
      { name: "Item 2", children: ["c", "d"] }
    ]);
    render = () => {
      return html`<ul>
        ${repeat(this._items(), (item) => html`
          <li>
            ${item.name}
            <ul>
              ${repeat(item.children, (child) => html`<li>${child}</li>`)}
            </ul>
          </li>
        `)}
      </ul>`;
    };
    static styles = css``;
  }
);
export {
  NestedRepeatTest
};
