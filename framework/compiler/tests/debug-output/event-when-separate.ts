import { Component, registerComponent } from '../../../runtime/dom/shadow-dom.js';
import { signal } from '../../../runtime/signal/signal.js';

export const SeparateTest = registerComponent(
  { selector: 'separatetest-comp', type: 'component' },
  class extends Component {
    private _visible = signal(true);
    render = () => {
      return html`<div "${when(this._visible())}"><button @click=${this._handleClick}>Click</button></div>`;
    };
    private _handleClick() {
      console.log('clicked');
    }
    static styles = css``;
  },
);
