import { Component, registerComponent } from '../services';

export default registerComponent(
  { name: 'ui-image', fullHeight: true },
  class extends Component {
    static get observedAttributes() {
      return ['name', 'iconcolor'];
    }

    attributeChangedCallback() {
      this.render();
    }

    render = () => {
      // const name = this.getAttribute('name') ?? '';
      // const className = this.getAttribute('className') ?? '';
      // const iconColor = this.getAttribute('iconColor') ?? '';
      // const fullHeight = this.getAttribute('fullHeight') ?? '';

      // const image = document.createElement('img');

      // getImage(name, iconColor).then((data) => {
      //   image.src = data;
      //   image.className = `${fullHeight ? 'ui-image-full-height ' : ''}${className}`;
      //   this.innerHTML = image.outerHTML;
      // });
    };

    styles = () => {
      return html`
        <style>
          ui-image {
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
          }

          .ui-image-full-height {
            height: 100%;
          }

          @keyframes spin {
            100% {
              transform: rotate(360deg);
            }
          }
        </style>
      `;
    };
  },
);
