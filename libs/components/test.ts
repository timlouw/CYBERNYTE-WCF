import { BehaviorSubject } from '@models';
import { bindReactiveProperty, Component, registerComponent } from '@services';

export default registerComponent(
  { name: 'my-element' },
  class extends Component {
    reactiveColor = new BehaviorSubject(this.getAttribute('color'));
    reactiveText = new BehaviorSubject('asdasd');

    initializeBindings = () => {
      bindReactiveProperty(this.shadowRoot, this.reactiveColor, '.box', 'style', 'background-color');
      bindReactiveProperty(this.shadowRoot, this.reactiveText, '.box2', 'innerText');
    };

    render = () => {
      return html`
        <div class="box" style="background-color: ${this.reactiveColor.getValue()}"></div>
        <div class="box2">${this.reactiveText.getValue()}</div>
      `;
    };

    styles = () => {
      return css`
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
    };
  },
);
