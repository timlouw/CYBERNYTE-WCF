import { Component, registerComponent } from '@services';

export default registerComponent(
  { name: 'ui-button' },
  class extends Component {
    render = () => {
      const getTheme = 'ui-button-' + (this.getAttribute('theme') ?? 'secondary');
      const getDisabled = this.getAttribute('disabled');
      const text = this.getAttribute('text') ?? 'No Button Text';
      const theme = getDisabled === 'true' ? 'ui-button-disabled' : getTheme;
      const width = this.getAttribute('width') ?? 'auto';
      const shape = 'ui-button-' + (this.getAttribute('shape') ?? 'rounded');
      let prefixIcon = this.getAttribute('prefixIcon') ?? '';
      let suffixIcon = this.getAttribute('suffixIcon') ?? '';
      let aboveIcon = this.getAttribute('aboveIcon') ?? '';
      const prefixIconColor = this.getAttribute('prefixIconColor') ?? '#000000';
      const suffixIconColor = this.getAttribute('suffixIconColor') ?? '#000000';
      const aboveIconColor = this.getAttribute('aboveIconColor') ?? '#000000';

      aboveIcon = aboveIcon ? html`<ui-image style="display: block;" className="ui-button-above-icon" name="${aboveIcon}" iconColor="${aboveIconColor}"></ui-image>` : '';

      if (!aboveIcon) {
        prefixIcon = prefixIcon ? html`<ui-image className="ui-button-prefix-icon" name="${prefixIcon}" iconColor="${prefixIconColor}"></ui-image>` : '';

        suffixIcon = suffixIcon ? html`<ui-image className="ui-button-suffix-icon" name="${suffixIcon}" iconColor="${suffixIconColor}"></ui-image>` : '';
      }

      const uiButtonContainer = document.createElement('div');
      uiButtonContainer.className = 'ui-button-container';
      uiButtonContainer.style.justifyContent = 'center';
      uiButtonContainer.style.flexDirection = aboveIcon ? 'column' : 'row';

      const uiButtonTextContainer = document.createElement('span');
      uiButtonTextContainer.className = 'ui-button-text-container';
      uiButtonTextContainer.style.height = !aboveIcon ? '14px' : '28px';
      uiButtonTextContainer.innerHTML = text;

      uiButtonContainer.innerHTML = ` ${!aboveIcon ? prefixIcon : ''} ${aboveIcon} ${uiButtonTextContainer.outerHTML} ${!aboveIcon ? suffixIcon : ''} `;

      this.appendChild(uiButtonContainer);

      this.className = this.className + ` ui-button ripple ${theme} ${shape}`;
      this.style.width = width;
      this.style.fontSize = !aboveIcon ? '12px' : '16px';
    };

    styles = () => {
      return html`
        <style>
          .ui-button {
            box-sizing: border-box;
            border: 0;
            padding: 8px 20px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            min-height: 37px;
          }

          .ui-button-rounded {
            border-radius: 20px;
          }

          .ui-button-squared {
            border-radius: 8px;
          }

          .ui-button:hover {
            opacity: 0.9;
          }

          .ui-button:focus {
            outline: 0 !important;
            box-shadow: none;
          }

          .ui-button-primary {
            color: var(--white);
            background-color: var(--primary);
          }

          .ui-button-secondary {
            color: var(--secondary);
            background-color: var(--white);
            border: 1px solid var(--secondary);
          }

          .ui-button-tertiary {
            color: var(--primary);
            background-color: var(--white);
            border: 1px solid var(--primary);
          }

          .ui-button-quaternary {
            color: var(--white);
            border: 1px solid var(--white);
          }

          .ui-button-no-theme {
            color: var(--primary);
            background-color: var(--white);
          }

          .ui-button-disabled {
            color: var(--grey) !important;
            background-color: var(--lightGrey) !important;
            cursor: default !important;
          }

          .ui-button-above-icon {
            height: 26px;
          }

          .ui-button-prefix-icon {
            height: 19px;
            margin-right: 6px;
            float: left;
          }

          .ui-button-suffix-icon {
            height: 19px;
            margin-left: 16px;
            position: absolute;
            right: 0px;
          }

          .ui-button-container {
            align-items: center;
            display: flex;
            width: 100%;
          }

          .ui-button-text-container {
            overflow: hidden;
            text-align: left;
          }
        </style>
      `;
    };
  },
);
