import { signal } from '../../../framework/runtime/models/index.js';
import { Component, registerComponent } from '../../../framework/runtime/services/index.js';

interface MyElementProps {
  color: string;
}

export const MyElementComponent = registerComponent<MyElementProps>(
  { selector: 'my-element', type: 'component' },
  class extends Component {
    color = signal(this.getAttribute('color'));
    text = signal('asdfs');

    render = () => {
      const update = () => {
        this.color(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
        this.text(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
      };

      update();

      setTimeout(() => {
        update();
      }, 3000);

      setTimeout(() => {
        update();
      }, 6000);

      return html`
        <div class="box" style="background-color: ${this.color()}"></div>
        <div class="box" style="background-color: ${this.color()}"></div>
        <div class="box" style="background-color: ${this.color()}"></div>
        <div class="box" style="background-color: ${this.color()}"></div>
        <div class="box" style="background-color: ${this.color()}"></div>
        <div class="box" style="background-color: ${this.color()}"></div>
        <div class="box2">${this.text()}</div>
        <div class="box2">${this.text()}</div>
        <div class="box2">${this.text()}</div>
        <div class="box2">${this.text()}</div>
        <div class="box2">${this.text()}</div>
        <div class="box2">${this.text()}</div>
      `;
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
