import { BehaviorSubject } from '../models/BehaviorSubject';
import { DOM_DATA_INPUT_ATTRIBUTE_NAME, DOM_DATA_OUTPUT_ATTRIBUTE_NAME, Component, registerComponent, getDataInputBinding, getDataOutputBinding, setClick } from '../services';

export default registerComponent(
  { name: 'ui-multi-select', clickDetection: true },
  class extends Component {
    render = () => {
      getDataInputBinding(this.getAttribute(DOM_DATA_INPUT_ATTRIBUTE_NAME) ?? '').subscribe((selectOptions: { value: string; selected: boolean }[]) => {
        const type = (this.getAttribute('type') ?? 'squared') + '-ui-multi-select';
        const label = this.getAttribute('label') ?? 'No Label Provided';
        const getDisabled = this.getAttribute('disabled') ?? 'false';
        // const values = this.getAttribute('values') ?? [];
        const theme = this.getAttribute('theme') ?? '';
        const outputBinding = getDataOutputBinding(this.getAttribute(DOM_DATA_OUTPUT_ATTRIBUTE_NAME) ?? '');

        const selectOuterContainer = document.createElement('div');
        let color = getDisabled === 'true' ? 'var(--semiGrey)' : 'var(--inputGrey)';
        if (theme === 'white') {
          color = getDisabled === 'true' ? 'var(--semiGrey)' : 'var(--lightGrey)';
        }

        const background = theme === 'white' ? 'var(--secondary)' : 'var(--white)';

        selectOuterContainer.innerHTML = html`
          <div class="ui-multi-select-inner-container">
            <select class="${theme === 'white' ? 'ui-multi-select ui-multi-select-white' : 'ui-multi-select'} ${type}" ${getDisabled === 'true' ? 'disabled' : ''}>
              ${this.getAllUnSelectedOptions(selectOptions)}
            </select>
            <label class="multi-select-label" style="color: ${color}; background-color: ${background}">${label}</label>
            <br />
            <span class="ui-multi-select-selected-elements"></span>
          </div>
        `;
        selectOuterContainer.className = `ui-multi-select-outer-container`;

        const selectElement = selectOuterContainer.querySelector('select');
        const selectedElement = selectOuterContainer.querySelector('.ui-multi-select-selected-elements') as HTMLElement;
        selectElement?.addEventListener('change', (e: any) => {
          if (e.target.value !== selectOptions[0].value) {
            const value = e.target.value;
            selectOptions.forEach((option) => {
              if (option.value === value) {
                option.selected = true;
              }
            });
            outputBinding.next(selectOptions.filter((option) => option.selected));
            selectElement.innerHTML = this.getAllUnSelectedOptions(selectOptions);
          }
          const selectedHTML = this.getAllSelectedOptions(selectOptions, theme, selectedElement, selectElement, outputBinding);
          selectedElement.innerHTML = selectedHTML;
          if (selectedHTML) {
            e.target.value = '';
          }
        });

        outputBinding.subscribe((isValid) => {
          if (isValid) {
            selectElement?.classList.remove('invalid-multi-select');
          } else {
            selectElement?.classList.add('invalid-multi-select');
          }
        });

        this.appendChild(selectOuterContainer);
      });
    };

    styles = () => {
      return html`
        <style>
          .ui-multi-select-selected-chip {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 0px 3px;
            padding: 3px;
            border-radius: 5px;
            border: 1px solid var(--primary);
            background-color: var(--white);
            color: var(--primary);
            font-size: 10px;
            min-width: max-content;
          }

          .ui-multi-select-icon-comp {
            z-index: 4;
          }

          .ui-multi-select-icon {
            margin-left: 5px;
            height: 14px;
          }

          .ui-multi-select-outer-container {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 20px 0px;
          }

          .ui-multi-select-inner-container {
            position: relative;
            width: 100%;
          }

          .multi-select-label {
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
            z-index: 2;
          }

          .ui-multi-select-selected-elements {
            position: absolute;
            left: 3px;
            top: 30%;
            z-index: 9;
            padding: 0px 3px;
            margin: 0px 3px;
            color: var(--primary);
            max-width: calc(100% - 55px);
            width: min-content;
            height: 22px;
            display: flex;
            justify-content: flex-start;
            align-items: center;
            overflow-x: scroll;
            overflow-y: hidden;
            user-select: none;
          }

          .ui-multi-select {
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
            z-index: 1;
            position: relative;
          }

          .ui-multi-select-white {
            color: var(--white) !important;
            border-color: var(--lightGrey) !important;
            background-color: var(--secondary) !important;
            background-image: url("data:image/svg+xml;utf8,<svg fill='white' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
          }

          .squared-ui-multi-select {
            border-radius: 5px;
          }

          .rounded-ui-multi-select {
            border-radius: 50px;
          }

          .ui-multi-select:focus {
            border-color: var(--primary);
          }

          .ui-multi-select-white:focus {
            border-color: var(--white);
          }

          .ui-multi-select:focus + .multi-select-label {
            color: var(--primary) !important;
            top: 0;
            font-size: 15px;
            transform: translateY(-50%) scale(0.9);
          }

          .ui-multi-select-white:focus + .multi-select-label {
            color: var(--white) !important;
          }

          .ui-multi-select:not(:placeholder-shown) + .multi-select-label {
            top: 0;
            transform: translateY(-50%) scale(0.9);
          }

          .invalid-multi-select {
            border-color: var(--error) !important;
            border-width: 2px !important;
          }
        </style>
      `;
    };

    getAllSelectedOptions(
      options: { value: string; selected: boolean }[],
      theme: string,
      selectedElement: HTMLElement,
      selectElement: HTMLSelectElement,
      outputBinding: BehaviorSubject<any>,
    ) {
      let selectedHTML = '';
      options.forEach((option) => {
        if (option.selected) {
          const clickBinding = option.value + 'RemoveClick';
          setClick(clickBinding, () => {
            option.selected = false;
            const selectedHTML = this.getAllSelectedOptions(options, theme, selectedElement, selectElement, outputBinding);
            selectedElement.innerHTML = selectedHTML;
            selectElement.innerHTML = this.getAllUnSelectedOptions(options);
            if (selectedHTML) {
              selectElement.value = '';
            }
          });

          outputBinding.next(options.filter((option) => option.selected));

          selectedHTML += `
            <span class="ui-multi-select-selected-chip">
              ${option.value}
              <ui-image data-click="${clickBinding}" class="ui-multi-select-icon-comp" className="ui-multi-select-icon" name="close" iconColor="${
                theme === 'white' ? '#FFFFFF' : '#1a1d56'
              }"></ui-image>
            </span>
          `;
        }
      });

      return selectedHTML;
    }

    getAllUnSelectedOptions(options: { value: string; selected: boolean }[]) {
      let unselectedHTML = '';
      options.forEach((option) => {
        if (!option.selected) {
          unselectedHTML += `<option>${option.value}</option>`;
        }
      });
      return unselectedHTML;
    }
  },
);
