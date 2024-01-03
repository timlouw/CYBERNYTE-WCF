import { DOM_DATA_INPUT_ATTRIBUTE_NAME, Component, registerComponent, getDataInputBinding } from '@services';

export default registerComponent(
  { name: 'ui-icon-button' },
  class extends Component {
    render = () => {
      const theme = 'ui-icon-button-' + (this.getAttribute('theme') ? this.getAttribute('theme') : 'no-theme');
      const iconColor = this.getIconColor(theme) ?? '';
      const icon = this.getAttribute('icon') ?? '';
      const dataInput = this.getAttribute(DOM_DATA_INPUT_ATTRIBUTE_NAME);

      if (dataInput) {
        getDataInputBinding(dataInput).subscribe((loading) => {
          this.generateHTML(icon, theme, loading, iconColor);
        });
      } else {
        this.generateHTML(icon, theme, false, iconColor);
      }
    };

    styles = () => {
      return html`
        <style>
          .ui-icon-button {
            border: 0;
            border-radius: 20px;
            padding: 3px 7px;
            font-weight: 600;
            cursor: pointer;
            display: inline-block;
            width: 38px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: var(--white);
          }

          .ui-icon-button:hover {
            opacity: 0.9;
            outline: 0;
          }

          .ui-icon-button:focus {
            outline: 0;
          }

          .ui-icon-button-no-theme {
            background-color: transparent;
          }

          .ui-icon-button-white {
            background-color: var(--white);
          }

          .ui-icon-button-primary {
            background-color: transparent;
          }

          .icon-button-image-spin {
            animation: spin 1s linear infinite;
          }

          .icon-button-image {
            height: 100%;
          }
        </style>
      `;
    };

    generateHTML(icon: string, theme: string, loading: boolean, iconColor: string) {
      const button = document.createElement('button');
      button.innerHTML = html`
        <ui-image class="icon-button-image ${loading === true ? 'icon-button-image-spin' : ''}" name="${icon}" iconColor="${iconColor}" fullHeight="true"></ui-image>
      `;
      button.className = `ui-icon-button f-14 ripple ${theme}`;

      this.appendChild(button);
    }

    getIconColor(theme: string) {
      switch (theme) {
        case 'ui-icon-button-no-theme': {
          return '#000000';
        }

        case 'ui-icon-button-white': {
          return '#1A1D56';
        }

        case 'ui-icon-button-primary': {
          return '#FFFFFF';
        }
      }
    }
  },
);
