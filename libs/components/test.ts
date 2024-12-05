import { signal } from '@models';
import { bindReactiveProperty, Component, registerComponent } from '@services';

interface MyElementProps {
  color: string;
}

export const MyElementComponent = registerComponent<MyElementProps>(
  { selector: 'my-element', type: 'component' },
  class extends Component {
    color = signal(this.getAttribute('color'));
    text = signal('asdfs');

    initializeBindings = () => {
      bindReactiveProperty(this.shadowRoot, this.color, '.box', 'style', 'background-color');
      bindReactiveProperty(this.shadowRoot, this.text, '.box2', 'innerText');

      setTimeout(() => {
        this.color('green')
        this.text('green')
      }, 0);
    };

    render = () => {
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
        background-color: blue;
        border-radius: 5px;
        border: 2px solid green;
      }
    `;
  },
);
