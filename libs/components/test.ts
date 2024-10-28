import { BehaviorSubject } from '@models';
import { bindReactiveProperty, Component, registerComponent } from '@services';

export default registerComponent(
  { name: 'my-element' },
  class extends Component {
    color = new BehaviorSubject(this.getAttribute('color'));
    reactiveText = new BehaviorSubject('asdasd');

    initializeBindings = () => {
      bindReactiveProperty(this.shadowRoot, this.color, '.box', 'style', 'background-color');
      bindReactiveProperty(this.shadowRoot, this.reactiveText, '.box2', 'innerText');
    };

    render = () => {
      setInterval(() => {
        this.color.next(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
        this.reactiveText.next(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
      }, 3000);

      return html`
        <div class="box" style="background-color: ${this.color.getValue()}"></div>
        <div class="box2">${this.reactiveText.getValue()}</div>
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
