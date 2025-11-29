import { signal } from '@models';
import { Component, registerComponent } from '@services';

interface MyElementProps {
  color: string;
}

export const MyElementComponent = registerComponent<MyElementProps>(
  { selector: 'my-element', type: 'component' },
  class extends Component {
    color = signal(this.getAttribute('color'));
    text = signal('asdfs');

    render = () => {
      setInterval(() => {
        this.color(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
        this.text(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
      }, 3000);

      return html`
        <div class="box" style="background-color: ${this.color()}"></div>
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
