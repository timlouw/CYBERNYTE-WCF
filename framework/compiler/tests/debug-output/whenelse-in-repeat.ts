import { Component, registerComponent } from '../../../runtime/dom/shadow-dom.js';
import { signal } from '../../../runtime/signal/signal.js';

export const WhenElseInRepeatTest = registerComponent(
  { selector: 'whenelseinrepeattest-comp', type: 'component' },
  class extends Component {
    private _items = signal([
      { name: 'Item 1', active: true },
      { name: 'Item 2', active: false },
    ]);
    render = () => {
      return html`<ul>
        ${repeat(
          this._items(),
          (item) => html` <li> ${whenElse(item.active, html`<span class="active">Active: ${item.name}</span>`, html`<span class="inactive">Inactive: ${item.name}</span>`)} </li> `,
        )}
      </ul>`;
    };

    static styles = css``;
  },
);
