import { Component, getRandomNumber, registerComponent, setClick, setIfBinding } from '@services';

export default registerComponent(
  { name: 'my-element', clickDetection: true, changeDetection: true },
  class extends Component {
    color = this.getAttribute('color');
    random = getRandomNumber(0, 100000) + 'buttonClickBinding';
    clickBinding = this.random + 'buttonClickBinding';
    ifBinding = this.random + 'buttonClickBinding';
    ifBindingBS = setIfBinding(this.ifBinding, true);

    render = () => {
      setClick(this.clickBinding, () => {
        console.log(this.clickBinding);
        this.ifBindingBS.next(!this.ifBindingBS.getValue());
      });

      return `
        <div class="box" style="background-color: ${this.color}" data-if="${this.ifBinding}"></div>
        <div class="box2" data-click="${this.clickBinding}"></div>
      `;
    };

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
