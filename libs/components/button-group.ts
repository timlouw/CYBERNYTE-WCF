import { DOM_DATA_OUTPUT_ATTRIBUTE_NAME, getDataOutputBinding, setClick, Component, registerComponent } from '../services';

export default registerComponent(
  { name: 'ui-button-group', clickDetection: true },
  class extends Component {
    render = () => {
      const getTheme = 'ui-button-group-' + (this.getAttribute('theme') ?? 'secondary');
      const getDisabled = this.getAttribute('disabled');
      const textOne = this.getAttribute('textOne') ?? 'No Button Text';
      const textTwo = this.getAttribute('textTwo') ?? 'No Button Text';
      const theme = getDisabled === 'true' ? 'ui-button-group-disabled' : getTheme;
      const width = this.getAttribute('width') ?? 'auto';
      const shape = 'ui-button-group-' + (this.getAttribute('shape') ?? 'rounded');
      const prefixIconOneName = this.getAttribute('prefixIconOne') ?? '';
      const prefixIconTwoName = this.getAttribute('prefixIconTwo') ?? '';
      const outputBinding = this.getAttribute(DOM_DATA_OUTPUT_ATTRIBUTE_NAME) ?? '';
      const value = this.getAttribute('value') ?? '';

      const uiButtonContainerOne = document.createElement('div');
      uiButtonContainerOne.className = 'ui-button-group-container';
      uiButtonContainerOne.style.justifyContent = 'center';
      const uiButtonTextContainerOne = document.createElement('span');
      uiButtonTextContainerOne.className = 'ui-button-group-text-container';
      uiButtonTextContainerOne.innerHTML = textOne;
      uiButtonContainerOne.innerHTML = html` ${this.getPrefixIcon(prefixIconOneName, value === 'true', getTheme)} ${uiButtonTextContainerOne.outerHTML} `;

      const uiButtonContainerTwo = document.createElement('div');
      uiButtonContainerTwo.className = 'ui-button-group-container';
      uiButtonContainerTwo.style.justifyContent = 'center';
      const uiButtonTextContainerTwo = document.createElement('span');
      uiButtonTextContainerTwo.className = 'ui-button-group-text-container';
      uiButtonTextContainerTwo.innerHTML = textTwo;
      uiButtonContainerTwo.innerHTML = html` ${this.getPrefixIcon(prefixIconTwoName, value === 'false', getTheme)} ${uiButtonTextContainerTwo.outerHTML} `;

      const uiButtonOne = document.createElement('div');
      const clickBindingOne = 'uiButtonGroupOneClick' + Math.random().toString(36).substring(2, 15);
      uiButtonOne.setAttribute('data-click', clickBindingOne);
      uiButtonOne.className = `ui-button-group ui-button-group-one ripple ${theme} ${shape} ${value === 'true' ? ' ' + this.getActiveClass(getTheme) : ''}`;
      uiButtonOne.appendChild(uiButtonContainerOne);

      const uiButtonTwo = document.createElement('div') as HTMLElement;
      const clickBindingTwo = 'uiButtonGroupTwoClick' + Math.random().toString(36).substring(2, 15);
      uiButtonTwo.setAttribute('data-click', clickBindingTwo);
      uiButtonTwo.className = `ui-button-group ui-button-group-two ripple ${theme} ${shape} ${value === 'false' ? ' ' + this.getActiveClass(getTheme) : ''}`;
      uiButtonTwo.appendChild(uiButtonContainerTwo);

      setClick(clickBindingOne, () => {
        uiButtonOne.classList.add(this.getActiveClass(getTheme));
        uiButtonContainerOne.querySelector('#image')?.setAttribute('iconColor', this.getIconColor(true, getTheme));
        uiButtonTwo.classList.remove(this.getActiveClass(getTheme));
        uiButtonContainerTwo.querySelector('#image')?.setAttribute('iconColor', this.getIconColor(false, getTheme));
        getDataOutputBinding(outputBinding).next(true);
      });

      setClick(clickBindingTwo, () => {
        uiButtonOne.classList.remove(this.getActiveClass(getTheme));
        uiButtonContainerOne.querySelector('#image')?.setAttribute('iconColor', this.getIconColor(false, getTheme));
        uiButtonTwo.classList.add(this.getActiveClass(getTheme));
        uiButtonContainerTwo.querySelector('#image')?.setAttribute('iconColor', this.getIconColor(true, getTheme));
        getDataOutputBinding(outputBinding).next(false);
      });

      this.appendChild(uiButtonOne);
      this.appendChild(uiButtonTwo);
      this.className = 'ui-button-group-outer-container';
      this.style.width = width;
      this.style.fontSize = '13px';
    };

    styles = () => {
      return html`
        <style>
          .ui-button-group-outer-container {
            display: flex;
            width: 100%;
          }

          .ui-button-group {
            box-sizing: border-box;
            border: 0;
            padding: 10px 20px;
            font-weight: 600;
            cursor: pointer;
            display: block;
            flex-grow: 1;
          }

          .ui-button-group-active-primary {
            background-color: var(--white) !important;
            color: var(--secondary) !important;
          }

          .ui-button-group-active {
            background-color: var(--secondary) !important;
            color: var(--white) !important;
          }

          .ui-button-group-rounded {
            border-radius: 20px;
          }

          .ui-button-group-squared {
            border-radius: 8px;
          }

          .ui-button-group-one {
            border-top-right-radius: 0px !important;
            border-bottom-right-radius: 0px !important;
            width: 50%;
          }

          .ui-button-group-two {
            border-top-left-radius: 0px !important;
            border-bottom-left-radius: 0px !important;
            width: 50%;
          }

          .ui-button-group:hover {
            opacity: 0.9;
          }

          .ui-button-group:focus {
            outline: 0 !important;
            box-shadow: none;
          }

          .ui-button-group-primary {
            color: var(--white);
            background-color: var(--secondary);
            border: 1px solid var(--white);
          }

          .ui-button-group-secondary {
            color: var(--primary);
            background-color: var(--white);
            border: 1px solid var(--secondary);
          }

          .ui-button-group-disabled {
            color: var(--grey) !important;
            background-color: var(--lightGrey) !important;
            cursor: default !important;
          }

          .ui-button-group-prefix-icon-one,
          .ui-button-group-prefix-icon-two {
            height: 19px;
            margin-right: 6px;
            float: left;
          }

          .ui-button-group-container {
            align-items: center;
            display: flex;
            width: 100%;
          }

          .ui-button-group-text-container {
            overflow: hidden;
            text-align: left;
          }
        </style>
      `;
    };

    getActiveClass(getTheme: string) {
      return getTheme.includes('primary') ? 'ui-button-group-active-primary' : 'ui-button-group-active';
    }

    getPrefixIcon(icon: string, active: boolean, getTheme: string) {
      let iconColor = active ? '#FFFFFF' : '#1a1d56';
      if (getTheme.includes('primary')) {
        iconColor = active ? '#3a54b4' : '#FFFFFF';
      }
      return icon ? html`<ui-image id="image" className="ui-button-group-prefix-icon-one" name="${icon}" iconColor="${iconColor}"></ui-image>` : '';
    }

    getIconColor(active: boolean, getTheme: string) {
      let iconColor = active ? '#FFFFFF' : '#1a1d56';
      if (getTheme.includes('primary')) {
        iconColor = active ? '#3a54b4' : '#FFFFFF';
      }
      return iconColor;
    }
  },
);
