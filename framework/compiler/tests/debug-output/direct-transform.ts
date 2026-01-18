import { Component, registerComponent } from '../../runtime/dom/shadow-dom.js';
import { signal } from '../../runtime/signal/signal.js';

export const EventWhenTest = registerComponent(
  { selector: 'eventwhentest-comp', type: 'component' },
  class extends Component {
    private _visible = signal(true);
    render = () => {
      return html`<button "${when(this._visible())}" @click=${this._handleClick}>Click</button>`;
    };
    private _handleClick() {
      console.log('clicked');
    }
    static styles = css``;
  },
);
