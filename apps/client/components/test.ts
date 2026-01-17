import { Component, registerComponent } from '../../../framework/runtime/dom/shadow-dom.js';
import { signal } from '../../../framework/runtime/signal/signal.js';

interface MyElementProps {
  color: string;
}

export const MyElementComponent = registerComponent<MyElementProps>(
  { selector: 'my-element', type: 'component' },
  class extends Component {
    private _color = signal(this.getAttribute('color'));
    private _loading = signal(true);
    private _countries = signal(['USA', 'Canada', 'Mexico', 'Germany', 'France', 'Italy', 'Spain', 'Japan', 'China', 'India']);

    render = () => {
      setTimeout(() => {
        this._update();
      }, 500);

      // Example 1: Remove item at index (splice)
      setTimeout(() => {
        this._countries(this._countries().toSpliced(2, 1));
      }, 1000);

      // Example 2: Add item at end
      setTimeout(() => {
        this._countries([...this._countries(), 'Brazil']);
      }, 1500);

      // Example 3: Update item at specific index
      setTimeout(() => {
        const arr = [...this._countries()];
        arr[0] = 'United States';
        this._countries(arr);
      }, 2000);

      // Example 4: Move item (swap positions)
      setTimeout(() => {
        const arr = [...this._countries()];
        [arr[0], arr[1]] = [arr[1], arr[0]];
        this._countries(arr);
      }, 2500);

      return html`
        <div class="box" style="background-color: ${this._color()}"></div>
        <div class="box" style="background-color: ${this._color()}"></div>
        <div "${when(this._loading())}" class="box" style="background-color: ${this._color()}"></div>
        <div "${when(this._loading())}" class="box" style="background-color: ${this._color()}"></div>
        <div class="status">
          ${whenElse(this._loading(), html`<div>Loading...</div>`, html`<div>Ready!</div>`)}
        </div>
        ${repeat(
          this._countries(),
          (country) => html`
            <div class="box2">${country}</div>
            ${country} ${country}
            <div class="box2">${country}</div>
          `,
        )}
      `;
    };

    private _update = () => {
      this._color(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
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
        background-color: white;
        border-radius: 5px;
        border: 2px solid green;
      }
    `;
  },
);
