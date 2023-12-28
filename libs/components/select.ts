import {
  DOM_DATA_INPUT_ATTRIBUTE_NAME,
  DOM_DATA_OUTPUT_ATTRIBUTE_NAME,
  Component,
  registerComponent,
  getDataInputBinding,
  getDataOutputBinding,
  getDataValidationBinding,
} from '../services';

export default registerComponent(
  { name: 'ui-select' },
  class extends Component {
    render = () => {
      getDataInputBinding(this.getAttribute(DOM_DATA_INPUT_ATTRIBUTE_NAME) ?? '').subscribe((selectOptions: any[]) => {
        const type = (this.getAttribute('type') ?? 'squared') + '-ui-select';
        const label = this.getAttribute('label') ?? 'No Label Provided';
        const getDisabled = this.getAttribute('disabled') ?? 'false';
        const value = this.getAttribute('value') ?? '';
        const theme = this.getAttribute('theme') ?? '';
        const outputBinding = this.getAttribute(DOM_DATA_OUTPUT_ATTRIBUTE_NAME) ?? '';

        const optionsHTML = html`
          ${selectOptions.map((option) => {
            if (value === option) {
              return '<option selected>' + option + '</option>';
            } else {
              return '<option >' + option + '</option>';
            }
          })}
        `;

        const selectOuterContainer = document.createElement('div');
        let color = getDisabled === 'true' ? 'var(--semiGrey)' : 'var(--inputGrey)';
        if (theme === 'white') {
          color = getDisabled === 'true' ? 'var(--semiGrey)' : 'var(--lightGrey)';
        }

        const background = theme === 'white' ? 'var(--secondary)' : 'var(--white)';

        selectOuterContainer.innerHTML = html`
          <div class="ui-select-inner-container">
            <select class="${theme === 'white' ? 'ui-select ui-select-white' : 'ui-select'} ${type}" ${getDisabled === 'true' ? 'disabled' : ''}>
              ${optionsHTML}
            </select>
            <label class="select-label" style="color: ${color}; background-color: ${background}">${label}</label>
          </div>
        `;
        selectOuterContainer.className = `ui-select-outer-container`;

        const selectElement = selectOuterContainer.querySelector('select');
        selectElement?.addEventListener('change', (e: any) => {
          const value = e.target.value;
          getDataOutputBinding(outputBinding).next(value);
        });

        getDataValidationBinding(outputBinding).subscribe((isValid) => {
          if (isValid) {
            selectElement?.classList.remove('invalid-select');
          } else {
            selectElement?.classList.add('invalid-select');
          }
        });

        this.appendChild(selectOuterContainer);
      });
    };

    styles = () => {
      return html`
        <style>
          .ui-select-outer-container {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 20px 0px;
          }

          .ui-select-inner-container {
            position: relative;
            width: 100%;
          }

          .select-label {
            position: absolute;
            left: 8px;
            top: 50%;
            transform: translateY(-50%);
            padding: 0px 3px;
            margin: 0px 3px;
            transition: 0.1s ease-out;
            transform-origin: left top;
            pointer-events: none;
            font-size: 13px;
          }

          .ui-select {
            -webkit-box-sizing: border-box; /* Safari/Chrome, other WebKit */
            -moz-box-sizing: border-box; /* Firefox, other Gecko */
            box-sizing: border-box;
            width: 100%;
            outline: none;
            border: 1px solid var(--inputGrey);
            padding: 15px 8px;
            transition: 0.1s ease-out;
            font-size: 16px;
            -webkit-appearance: none;
            -moz-appearance: none;
            background-image: url("data:image/svg+xml;utf8,<svg fill='black' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
            background-repeat: no-repeat;
            background-position-x: calc(100% - 20px);
            background-position-y: 50%;
            color: var(--primary);
            background-color: var(--white);
          }

          .ui-select-white {
            color: var(--white) !important;
            border-color: var(--lightGrey) !important;
            background-color: var(--secondary) !important;
            background-image: url("data:image/svg+xml;utf8,<svg fill='white' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
          }

          .squared-ui-select {
            border-radius: 5px;
          }

          .rounded-ui-select {
            border-radius: 50px;
          }

          .ui-select:focus {
            border-color: var(--primary);
          }

          .ui-select-white:focus {
            border-color: var(--white);
          }

          .ui-select:focus + .select-label {
            color: var(--primary) !important;
            top: 0;
            font-size: 15px;
            transform: translateY(-50%) scale(0.9);
          }

          .ui-select-white:focus + .select-label {
            color: var(--white) !important;
          }

          .ui-select:not(:placeholder-shown) + .select-label {
            top: 0;
            transform: translateY(-50%) scale(0.9);
          }

          .invalid-select {
            border-color: var(--error) !important;
            border-width: 2px !important;
          }
        </style>
      `;
    };
  },
);
