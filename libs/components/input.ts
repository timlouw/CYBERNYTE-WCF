import { DOM_DATA_OUTPUT_ATTRIBUTE_NAME, Component, registerComponent, getDataOutputBinding, getDataValidationBinding } from '@services';

export default registerComponent(
  { name: 'ui-input' },
  class extends Component {
    #textareaTop = '20%';
    #inputTop = '50%';

    render = () => {
      const value = this.getAttribute('value') ?? '';
      const type = (this.getAttribute('type') ?? 'squared') + '-ui-input';
      const label = this.getAttribute('label') ?? 'No Label Provided';
      const placeholder = this.getAttribute('placeholder') ?? ' ';
      const iconName = this.getAttribute('icon') ?? '';
      const getDisabled = this.getAttribute('disabled');
      const textarea = this.getAttribute('textarea');
      const theme = this.getAttribute('theme') ?? '';
      const outputBinding = this.getAttribute(DOM_DATA_OUTPUT_ATTRIBUTE_NAME) ?? '';

      let icon = '';
      if (iconName) {
        icon = html` <ui-image className="ui-input-icon" name="${iconName}" iconColor="${theme === 'white' ? '#FFFFFF' : '#1a1d56'}"></ui-image> `;
      }

      const inputHTML =
        textarea === 'true'
          ? `<textarea class="${
              theme === 'white' ? 'ui-textarea ui-textarea-white' : 'ui-textarea'
            } ${type}" rows="5" placeholder="${placeholder}" type="text" value="${value}" maxlength="200"></textarea>`
          : `<input class="${theme === 'white' ? 'ui-input ui-input-white' : 'ui-input'} ${
              iconName ? 'ui-input-with-icon' : ''
            } ${type}" placeholder="${placeholder}" type="text" value="${value}" maxlength="200">`;

      const top = textarea === 'true' ? this.#textareaTop : this.#inputTop;
      const inputOuterContainer = document.createElement('div');

      inputOuterContainer.innerHTML = html`
        <div class="ui-input-inner-container">
          ${icon} ${inputHTML}
          <label class="${theme === 'white' ? 'input-label input-label-white' : 'input-label'}" style="top: ${top}">${label}</label>
        </div>
      `;
      inputOuterContainer.className = `ui-input-outer-container ${getDisabled ? 'disabled' : ''}`;

      const inputElement = inputOuterContainer.querySelector(textarea === 'true' ? 'textarea' : 'input');
      inputElement?.addEventListener('input', (event: any) => {
        getDataOutputBinding(outputBinding).next(event.target.value);
      });

      getDataValidationBinding(outputBinding).subscribe((isValid) => {
        if (isValid) {
          inputElement?.classList.remove('invalid-input');
        } else {
          inputElement?.classList.add('invalid-input');
        }
      });

      this.appendChild(inputOuterContainer);
    };

    styles = () => {
      return html`
        <style>
          .ui-input-outer-container {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 20px 0px;
          }

          .ui-input-inner-container {
            position: relative;
            width: 100%;
          }

          .input-label {
            position: absolute;
            left: 8px;
            transform: translateY(-50%);
            background-color: var(--white);
            color: var(--inputGrey);
            padding: 0px 3px;
            margin: 0px 3px;
            transition: 0.1s ease-out;
            transform-origin: left top;
            pointer-events: none;
            font-size: 13px;
            text-align: left;
            line-height: 20px;
            width: calc(100% - 20px);
          }

          .input-label-white {
            color: var(--lightGrey);
            background-color: var(--secondary) !important;
          }

          .ui-input {
            -webkit-box-sizing: border-box;
            -moz-box-sizing: border-box;
            box-sizing: border-box;
            width: 100%;
            outline: none;
            border: 1px solid var(--inputGrey);
            padding: 15px 13px;
            transition: 0.1s ease-out;
            color: var(--primary);
            font-size: 16px;
          }

          .ui-input-white {
            color: var(--white) !important;
            border: 1px solid var(--lightGrey);
            background-color: var(--secondary) !important;
          }

          .ui-input-with-icon {
            padding-right: 50px;
          }

          .ui-textarea {
            -webkit-box-sizing: border-box;
            -moz-box-sizing: border-box;
            box-sizing: border-box;
            width: 100%;
            outline: none;
            border: 1px solid var(--inputGrey);
            padding: 15px 13px;
            transition: 0.1s ease-out;
            color: var(--primary);
            font-size: 16px;
          }

          .ui-textarea-white {
            border: 1px solid var(--lightGrey);
            color: var(--white) !important;
          }

          .squared-ui-input {
            border-radius: 5px;
          }

          .rounded-ui-input {
            border-radius: 50px;
            padding: 15px 20px;
            width: calc(100% - 40px);
          }

          .ui-input:focus {
            border-color: var(--primary);
          }

          .ui-input-white:focus {
            border-color: var(--white) !important;
          }

          .ui-input:placeholder {
            opacity: 1;
          }

          .ui-input:focus + .input-label {
            color: var(--primary);
            top: 0 !important;
            font-size: 15px;
            transform: translateY(-50%) scale(0.9);
            width: auto;
          }

          .ui-input-white:focus + .input-label-white {
            color: var(--white) !important;
          }

          .ui-input:not(:placeholder-shown) + .input-label {
            top: 0 !important;
            transform: translateY(-50%) scale(0.9);
            width: auto;
          }

          .ui-textarea:focus {
            border-color: var(--primary);
          }

          .ui-textarea-white:focus {
            border-color: var(--white) !important;
          }

          .ui-textarea:placeholder {
            opacity: 1;
          }

          .ui-textarea:focus + .input-label {
            color: var(--primary);
            top: 0 !important;
            font-size: 15px;
            transform: translateY(-50%) scale(0.9);
            width: auto;
          }

          .ui-textarea-white:focus + .input-label-white {
            color: var(--white) !important;
          }

          .ui-textarea:not(:placeholder-shown) + .input-label {
            top: 0 !important;
            transform: translateY(-50%) scale(0.9);
            width: auto;
          }

          .invalid-input {
            border-color: var(--error) !important;
            border-width: 2px !important;
          }

          .ui-input-icon {
            position: absolute;
            right: 18px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 20px;
            z-index: 10;
          }
        </style>
      `;
    };
  },
);
