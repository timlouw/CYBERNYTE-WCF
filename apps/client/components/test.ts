import { Component, registerComponent } from '../../../framework/runtime/dom/shadow-dom.js';
import { signal } from '../../../framework/runtime/signal/signal.js';

interface MyElementProps {
  color: string;
}

export const MyElementComponent = registerComponent<MyElementProps>(
  { selector: 'my-element', type: 'component' },
  class extends Component {
    private _color = signal(this.getAttribute('color'));
    private _text = signal('asdfs');
    private _loading = signal(true);
    private test = true;

    render = () => {
      setTimeout(() => {
        this._update();
      }, 1500);

      return html`
        <div class="box" style="background-color: ${this._color()}"></div>
        <div class="box" style="background-color: ${this._color()}"></div>
        <div "${when(this._loading())}" class="box" style="background-color: ${this._color()}"></div>
        <div "${when(this._loading())}" class="box" style="background-color: ${this._color()}"></div>
        <div class="box2">${this._text()}</div>
        <div class="box2">${this._text()}</div>
        <div "${when(!this._loading() && this.test)}" class="box2">${this._text()}</div>
        <div class="status">
          ${whenElse(this._loading(), html`<div>Loading...</div>`, html`<div>Ready!</div>`)}
        </div>
      `;
    };

    private _update = () => {
      this._color(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
      this._text(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
      this._loading(!this._loading());
    };

    static styles = css`
      .box {
        width: 100%;
        height: 20px;
        border-radius: 5px;
        border: 1px solid black;
      }

      .box2 {
        width: 100%;
        height: 20px;
        background-color: black;
        border-radius: 5px;
        border: 2px solid green;
      }
    `;
  },
);
