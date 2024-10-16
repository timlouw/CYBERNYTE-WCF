import { Component, registerComponent } from '@services';

export default registerComponent(
  { name: 'my-element', clickDetection: true },
  class extends Component {
    color = this.getAttribute('color');

    render = () => {
      return html`
        <div class="box" style="background-color: ${this.color}"></div>
        <div class="box2" @click="${(event: MouseEvent) => this.boxClick(event)}"></div>
      `;
    };

    boxClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      console.log('target', target);
    }

    styles = () => {
      return `
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
